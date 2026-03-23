import csv
from pathlib import Path

from inference import predict


symptoms = {
    "rapid_growth": True,
    "bleeding": False,
    "irregular_borders": True,
    "duration_over_6_weeks": True,
    "family_history": False,
}

base_dir = Path(__file__).resolve().parent
csv_path = base_dir / "data" / "dataset.csv"

with csv_path.open(newline="", encoding="utf-8") as csv_file:
    reader = csv.DictReader(csv_file)
    first_row = next(reader, None)

if not first_row:
    raise RuntimeError(f"No rows found in {csv_path}")

image_path = Path(first_row["image_path"])
if not image_path.exists():
    image_path = base_dir / "data" / "images" / image_path.name

result = predict(str(image_path), symptoms)

print("Predicted Class:", result["top_label"])
print("Cancer Probability:", result["cancer_probability"])
print("Model Confidence:", result["model_confidence"])
print("Final Risk Score:", result["final_risk_score"])
print("Risk Level:", result["risk_level"])
print("Decision:", result["decision"])
print("Disclaimer:", result["disclaimer"])
