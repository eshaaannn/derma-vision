from inference import predict
from pathlib import Path

symptoms = {
    "rapid_growth": True,
    "bleeding": False,
    "irregular_borders": True,
    "duration_over_6_weeks": True,
    "family_history": False
}

base_dir = Path(__file__).resolve().parent
melanoma_dir = base_dir / "data" / "MED_NODE" / "melanoma"
sample_image = melanoma_dir / "sample_image.jpg"

if sample_image.exists():
    image_path = sample_image
else:
    image_candidates = sorted(
        p for p in melanoma_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"}
    )
    if not image_candidates:
        raise FileNotFoundError(f"No images found in {melanoma_dir}")
    image_path = image_candidates[0]

result = predict(str(image_path), symptoms)

print("Cancer Probability:", result["cancer_probability"])
print("Model Confidence:", result["model_confidence"])
print("Final Risk Score:", result["final_risk_score"])
print("Risk Level:", result["risk_level"])
print("Decision:", result["decision"])
print("Disclaimer:", result["disclaimer"])
