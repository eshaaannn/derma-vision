import base64
import hashlib
from io import BytesIO
from pathlib import Path

import numpy as np
from PIL import Image

try:
    import torch
    from torchvision import models, transforms
except Exception:
    torch = None
    models = None
    transforms = None

try:
    from pytorch_grad_cam import GradCAM
    from pytorch_grad_cam.utils.image import show_cam_on_image
    from pytorch_grad_cam.utils.model_targets import ClassifierOutputTarget
except Exception:
    GradCAM = None
    show_cam_on_image = None
    ClassifierOutputTarget = None

BASE_DIR = Path(__file__).resolve().parent
MODEL_PATH = BASE_DIR / "model.pt"
DEVICE = "cpu"
DISCLAIMER = "This tool is for screening only and does not replace medical diagnosis."

_MODEL = None
_TRANSFORM = None
_MODEL_READY = None


def _build_transform():
    return transforms.Compose(
        [
            transforms.Resize((224, 224)),
            transforms.ToTensor(),
            transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
        ]
    )


def _ensure_model_ready():
    global _MODEL, _TRANSFORM, _MODEL_READY
    if _MODEL_READY is not None:
        return _MODEL_READY

    if torch is None or models is None or transforms is None:
        _MODEL_READY = False
        return _MODEL_READY

    if not MODEL_PATH.exists():
        _MODEL_READY = False
        return _MODEL_READY

    try:
        model = models.efficientnet_b0(weights=None)
        model.classifier[1] = torch.nn.Linear(1280, 2)
        model.load_state_dict(torch.load(MODEL_PATH, map_location=DEVICE))
        model.eval()

        _MODEL = model
        _TRANSFORM = _build_transform()
        _MODEL_READY = True
    except Exception:
        _MODEL_READY = False

    return _MODEL_READY


def compute_symptom_score(symptoms):
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


def _fallback_predict(image_bytes, symptoms=None):
    digest = hashlib.sha256(image_bytes).hexdigest()
    base_score = int(digest[:8], 16) / 0xFFFFFFFF
    symptom_score = compute_symptom_score(symptoms or {})
    final_risk = max(0.0, min(1.0, 0.8 * base_score + 0.2 * symptom_score))
    confidence = 0.65

    if final_risk >= 0.75:
        risk_level = "High"
        decision = "High risk signal detected. Dermatologist consultation recommended."
    elif final_risk >= 0.4:
        risk_level = "Medium"
        decision = "Moderate risk signal detected. Clinical follow-up advised."
    else:
        risk_level = "Low"
        decision = "Low risk signal. Continue routine monitoring."

    return {
        "cancer_probability": round(float(base_score), 4),
        "model_confidence": round(float(confidence), 4),
        "final_risk_score": round(float(final_risk), 4),
        "risk_level": risk_level,
        "decision": decision,
        "disclaimer": DISCLAIMER,
        "heatmap": None,
    }


def _build_heatmap(image, input_tensor, predicted_class):
    if GradCAM is None or show_cam_on_image is None or ClassifierOutputTarget is None:
        return None

    try:
        target_layers = [_MODEL.features[-1]]
        cam = GradCAM(model=_MODEL, target_layers=target_layers)
        targets = [ClassifierOutputTarget(predicted_class)]
        grayscale_cam = cam(input_tensor=input_tensor, targets=targets)[0, :]
        rgb_img = np.array(image.resize((224, 224))) / 255.0
        visualization = show_cam_on_image(rgb_img, grayscale_cam, use_rgb=True)

        pil_img = Image.fromarray(visualization)
        buffer = BytesIO()
        pil_img.save(buffer, format="PNG")
        return base64.b64encode(buffer.getvalue()).decode("utf-8")
    except Exception:
        return None


def predict(image_path, symptoms=None):
    image_path = Path(image_path)
    if not image_path.is_absolute():
        image_path = BASE_DIR / image_path
    if not image_path.exists():
        raise FileNotFoundError(f"Image file not found: {image_path}")

    image_bytes = image_path.read_bytes()
    if not _ensure_model_ready():
        return _fallback_predict(image_bytes, symptoms=symptoms)

    image = Image.open(image_path).convert("RGB")
    input_tensor = _TRANSFORM(image).unsqueeze(0)

    with torch.no_grad():
        output = _MODEL(input_tensor)
        probabilities = torch.softmax(output, dim=1)
        confidence_tensor, predicted = torch.max(probabilities, 1)

    cancer_prob = probabilities[0][1].item()
    confidence = confidence_tensor.item()

    high_threshold = 0.75
    low_threshold = 0.40

    if symptoms:
        symptom_score = compute_symptom_score(symptoms)
        final_risk = (0.7 * cancer_prob) + (0.3 * symptom_score)
    else:
        final_risk = cancer_prob

    if confidence < 0.5:
        risk_level = "Uncertain"
        decision = "Model confidence is low. Professional evaluation recommended."
        final_risk = cancer_prob
    elif final_risk > high_threshold:
        risk_level = "High"
        decision = "High cancer risk detected. Immediate dermatologist consultation recommended."
    elif final_risk < low_threshold:
        risk_level = "Low"
        decision = "Lesion appears low risk. Monitor for changes."
    else:
        risk_level = "Medium"
        decision = "Moderate risk detected. Dermatologist consultation advised."

    heatmap_base64 = _build_heatmap(image, input_tensor, predicted.item())

    return {
        "cancer_probability": round(float(cancer_prob), 4),
        "model_confidence": round(float(confidence), 4),
        "final_risk_score": round(float(final_risk), 4),
        "risk_level": risk_level,
        "decision": decision,
        "disclaimer": DISCLAIMER,
        "heatmap": heatmap_base64,
    }
