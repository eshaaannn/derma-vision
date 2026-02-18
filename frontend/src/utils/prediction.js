export function normalizePredictionResponse(data) {
  const confidence = Number(data?.confidence ?? data?.confidence_score ?? 0);
  const predictedClass =
    data?.predicted_class || data?.label || data?.prediction || "Unknown";
  const explanation =
    data?.explanation ||
    "AI analysis is complete. Please consult a dermatologist for final medical diagnosis.";
  const probabilityMap = data?.probabilities || {};

  const riskLevelRaw = String(data?.risk_level || data?.risk || "").toLowerCase();
  let riskLevel = "Low";
  if (riskLevelRaw.includes("high") || confidence >= 80) {
    riskLevel = "High";
  } else if (riskLevelRaw.includes("medium") || confidence >= 45) {
    riskLevel = "Medium";
  }

  const tips = data?.tips || [
    "Monitor this area for changes in size, color, or shape.",
    "Use broad-spectrum sunscreen SPF 30+ daily.",
    "Schedule periodic skin checks with a certified dermatologist.",
  ];

  return {
    confidence: Number.isFinite(confidence) ? confidence : 0,
    predictedClass,
    explanation,
    riskLevel,
    probabilities: probabilityMap,
    tips,
  };
}

export function getRiskScore(riskLevel) {
  if (riskLevel === "High") return 3;
  if (riskLevel === "Medium") return 2;
  return 1;
}
