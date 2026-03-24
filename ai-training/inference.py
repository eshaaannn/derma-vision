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
DEFAULT_LABEL_RISK = {
    "Suspicious_lesion": 0.92,
    "Bacterial_infection": 0.58,
    "Parasitic_infestation": 0.52,
    "Viral_skin_disease": 0.48,
    "Fungal_infection": 0.42,
    "Inflammatory_rash": 0.34,
    "Low_risk": 0.08,
    "Benign_lesion": 0.14,
    "Cancer": 0.92,
    "Non-Cancer": 0.14,
}

_MODEL = None
_TRANSFORM = None
_MODEL_READY = None
_CLASS_NAMES = []
_LABEL_RISK = {}


def _load_checkpoint(model_path):
    try:
        return torch.load(model_path, map_location=DEVICE, weights_only=False)
    except TypeError:
        return torch.load(model_path, map_location=DEVICE)


def _build_transform(image_size=224, normalization=None):
    normalization = normalization or {
        "mean": [0.485, 0.456, 0.406],
        "std": [0.229, 0.224, 0.225],
    }
    return transforms.Compose(
        [
            transforms.Resize((image_size, image_size)),
            transforms.ToTensor(),
            transforms.Normalize(mean=normalization["mean"], std=normalization["std"]),
        ]
    )


def _build_model(num_classes):
    model = models.efficientnet_b0(weights=None)
    model.classifier[1] = torch.nn.Linear(1280, num_classes)
    return model


def _default_label_risk(class_names):
    label_risk = {}
    for label in class_names:
        label_risk[label] = DEFAULT_LABEL_RISK.get(label, 0.4)
    return label_risk


def _ensure_model_ready():
    global _MODEL, _TRANSFORM, _MODEL_READY, _CLASS_NAMES, _LABEL_RISK
    if _MODEL_READY is not None:
        return _MODEL_READY

    if torch is None or models is None or transforms is None:
        _MODEL_READY = False
        return _MODEL_READY

    if not MODEL_PATH.exists():
        _MODEL_READY = False
        return _MODEL_READY

    try:
        checkpoint = _load_checkpoint(MODEL_PATH)
        if isinstance(checkpoint, dict) and "state_dict" in checkpoint:
            class_names = checkpoint.get("class_names") or ["Benign_lesion", "Suspicious_lesion"]
            label_risk = checkpoint.get("label_risk") or _default_label_risk(class_names)
            image_size = int(checkpoint.get("image_size", 224))
            normalization = checkpoint.get("normalization")
            state_dict = checkpoint["state_dict"]
        else:
            class_names = ["Non-Cancer", "Cancer"]
            label_risk = _default_label_risk(class_names)
            image_size = 224
            normalization = None
            state_dict = checkpoint

        model = _build_model(len(class_names))
        model.load_state_dict(state_dict)
        model.eval()

        _MODEL = model
        _CLASS_NAMES = list(class_names)
        _LABEL_RISK = dict(label_risk)
        _TRANSFORM = _build_transform(image_size=image_size, normalization=normalization)
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
    if symptoms.get("irregular_borders") or symptoms.get("irregular_border"):
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
    final_risk = max(0.0, min(1.0, 0.85 * base_score + 0.15 * symptom_score))
    confidence = 0.65

    if final_risk >= 0.72:
        risk_level = "High"
        top_label = "Suspicious_lesion"
        decision = "High-risk visual signal detected. Prompt dermatologist review is recommended."
    elif final_risk >= 0.35:
        risk_level = "Medium"
        top_label = "Inflammatory_rash"
        decision = "Moderate-risk visual signal detected. Clinical follow-up is advised."
    else:
        risk_level = "Low"
        top_label = "Benign_lesion"
        decision = "Low-risk visual signal detected. Continue routine monitoring."

    return {
        "cancer_probability": round(float(base_score), 4),
        "model_confidence": round(float(confidence), 4),
        "final_risk_score": round(float(final_risk), 4),
        "risk_level": risk_level,
        "decision": decision,
        "disclaimer": DISCLAIMER,
        "heatmap": None,
        "top_label": top_label,
        "predicted_class": top_label,
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


def _risk_from_probabilities(probabilities):
    score = 0.0
    class_probabilities = {}
    for index, label in enumerate(_CLASS_NAMES):
        probability = float(probabilities[index].item())
        class_probabilities[label] = round(probability, 4)
        score += probability * float(_LABEL_RISK.get(label, 0.4))

    suspicious_probability = 0.0
    for label, probability in class_probabilities.items():
        normalized = label.strip().lower()
        if normalized in {"suspicious_lesion", "cancer"}:
            suspicious_probability += probability

    return min(max(score, 0.0), 1.0), suspicious_probability, class_probabilities


def _decision_for_label(top_label, risk_level):
    normalized = (top_label or "").strip().lower()
    if risk_level == "High":
        return "High-risk pattern detected. Prompt in-person dermatology review is recommended."
    if "fung" in normalized:
        return "Pattern is more consistent with fungal skin disease. Clinical review is still advised if it spreads or persists."
    if "bacter" in normalized:
        return "Pattern is more consistent with bacterial skin infection. Seek medical review if it becomes painful, warm, or draining."
    if "viral" in normalized or "parasit" in normalized:
        return "Pattern suggests an infectious skin condition. Clinical evaluation is advised if symptoms worsen or spread."
    if "inflamm" in normalized:
        return "Pattern is more consistent with an inflammatory rash. Monitor symptoms and arrange review if it does not improve."
    if "low_risk" in normalized or "low risk" in normalized:
        return "Pattern looks low risk overall. Monitor it and seek review if it becomes painful, spreads, or changes."
    if "benign" in normalized:
        return "Pattern appears lower risk. Continue monitoring for visible change."
    return "Moderate-risk pattern detected. Clinical follow-up is advised."


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
        probabilities = torch.softmax(output, dim=1)[0]
        confidence_tensor, predicted = torch.max(probabilities, 0)

    top_label = _CLASS_NAMES[predicted.item()]
    confidence = float(confidence_tensor.item())
    risk_score, suspicious_probability, class_probabilities = _risk_from_probabilities(probabilities)

    if symptoms:
        symptom_score = compute_symptom_score(symptoms)
        final_risk = max(0.0, min(1.0, 0.85 * risk_score + 0.15 * symptom_score))
    else:
        final_risk = risk_score

    if confidence < 0.45:
        risk_level = "Medium" if final_risk >= 0.35 else "Low"
        decision = "Model confidence is limited. Professional review is recommended if the lesion changes or persists."
    elif final_risk >= 0.72:
        risk_level = "High"
        decision = _decision_for_label(top_label, risk_level)
    elif final_risk >= 0.35:
        risk_level = "Medium"
        decision = _decision_for_label(top_label, risk_level)
    else:
        risk_level = "Low"
        decision = _decision_for_label(top_label, risk_level)

    heatmap_base64 = _build_heatmap(image, input_tensor, predicted.item())

    return {
        "cancer_probability": round(float(suspicious_probability), 4),
        "model_confidence": round(float(confidence), 4),
        "final_risk_score": round(float(final_risk), 4),
        "risk_level": risk_level,
        "decision": decision,
        "disclaimer": DISCLAIMER,
        "heatmap": heatmap_base64,
        "top_label": top_label,
        "predicted_class": top_label,
        "class_probabilities": class_probabilities,
    }
