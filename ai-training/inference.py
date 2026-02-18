import torch
import numpy as np
import base64
from io import BytesIO
from pathlib import Path
from PIL import Image
import cv2

from torchvision import models, transforms
from pytorch_grad_cam import GradCAM
from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
from pytorch_grad_cam.utils.image import show_cam_on_image

# Device
device = torch.device("cpu")
BASE_DIR = Path(__file__).resolve().parent

# Load model
model = models.efficientnet_b0(weights=None)
model.classifier[1] = torch.nn.Linear(1280, 2)
model_path = BASE_DIR / "model.pt"
if not model_path.exists():
    raise FileNotFoundError(f"Model file not found: {model_path}")
model.load_state_dict(torch.load(model_path, map_location=device))
model.eval()

# Transform
transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize(
        mean=[0.485, 0.456, 0.406],
        std=[0.229, 0.224, 0.225]
    )
])

# --------------------------
# Follow-up Risk Scoring
# --------------------------

def compute_symptom_score(symptoms):
    """
    symptoms = {
        "rapid_growth": True/False,
        "bleeding": True/False,
        "irregular_borders": True/False,
        "duration_over_6_weeks": True/False,
        "family_history": True/False
    }
    """

    score = 0

    if symptoms.get("rapid_growth"):
        score += 0.2
    if symptoms.get("bleeding"):
        score += 0.2
    if symptoms.get("irregular_borders"):
        score += 0.15
    if symptoms.get("duration_over_6_weeks"):
        score += 0.1
    if symptoms.get("family_history"):
        score += 0.1

    return min(score, 1.0)

# --------------------------
# Main Predict Function
# --------------------------

def predict(image_path, symptoms=None):
    image_path = Path(image_path)
    if not image_path.is_absolute():
        image_path = BASE_DIR / image_path
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    image = Image.open(image_path).convert("RGB")
    input_tensor = transform(image).unsqueeze(0)

    # Forward pass
    with torch.no_grad():
        output = model(input_tensor)
        probabilities = torch.softmax(output, dim=1)
        confidence, predicted = torch.max(probabilities, 1)

    cancer_prob = probabilities[0][1].item()
    confidence = confidence.item()

    # --------------------------
    # Confidence Threshold Logic
    # --------------------------

    HIGH_THRESHOLD = 0.75
    LOW_THRESHOLD = 0.40

    # --------------------------
    # Grad-CAM
    # --------------------------

    target_layers = [model.features[-1]]
    cam = GradCAM(model=model, target_layers=target_layers)

    targets = [ClassifierOutputTarget(predicted.item())]
    grayscale_cam = cam(input_tensor=input_tensor, targets=targets)
    grayscale_cam = grayscale_cam[0, :]

    rgb_img = np.array(image.resize((224, 224))) / 255.0
    visualization = show_cam_on_image(rgb_img, grayscale_cam, use_rgb=True)

    # Convert heatmap to base64
    pil_img = Image.fromarray(visualization)
    buffer = BytesIO()
    pil_img.save(buffer, format="PNG")
    heatmap_base64 = base64.b64encode(buffer.getvalue()).decode("utf-8")

    # --------------------------
    # Risk Fusion with Symptoms
    # --------------------------

    if symptoms:
        symptom_score = compute_symptom_score(symptoms)
        final_risk = (0.7 * cancer_prob) + (0.3 * symptom_score)
    else:
        final_risk = cancer_prob

    # --------------------------
    # Uncertainty Handling
    # --------------------------

    if confidence < 0.5:
        risk_level = "Uncertain"
        decision = "Model confidence is low. Professional evaluation recommended."
        final_risk = cancer_prob

    else:

        if final_risk > HIGH_THRESHOLD:
            risk_level = "High"
            decision = "High cancer risk detected. Immediate dermatologist consultation recommended."

        elif final_risk < LOW_THRESHOLD:
            risk_level = "Low"
            decision = "Lesion appears low risk. Monitor for changes."

        else:
            risk_level = "Medium"
            decision = "Moderate risk detected. Dermatologist consultation advised."

        

    return {
    "cancer_probability": cancer_prob,
    "model_confidence": confidence,
    "final_risk_score": final_risk,
    "risk_level": risk_level,
    "decision": decision,
    "disclaimer": "This tool is for screening only and does not replace medical diagnosis.",
    "heatmap": heatmap_base64
}

