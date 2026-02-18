export function normalizePredictionResponse(data) {
  const riskScoreRaw = Number(
    data?.risk_score ?? data?.final_risk_score ?? data?.cancer_probability
  );
  const hasRiskScore = Number.isFinite(riskScoreRaw);
  const riskScore = hasRiskScore ? Math.min(1, Math.max(0, riskScoreRaw)) : null;

  const confidenceRaw = Number(
    data?.confidence ?? data?.confidence_score ?? data?.model_confidence
  );
  const confidence = Number.isFinite(confidenceRaw)
    ? confidenceRaw
    : hasRiskScore
      ? riskScore * 100
      : 0;

  const predictedClass =
    data?.predicted_class ||
    data?.label ||
    data?.prediction ||
    data?.top_label ||
    "Unknown";

  const explanation =
    data?.explanation ||
    data?.decision ||
    data?.risk_message ||
    "AI analysis is complete. Please consult a dermatologist for final medical diagnosis.";

  const probabilityMap = data?.probabilities || {};

  const riskLevelRaw = String(data?.risk_level || data?.risk || "").toLowerCase();
  let riskLevel = "Low";
  if (riskLevelRaw.includes("high")) {
    riskLevel = "High";
  } else if (riskLevelRaw.includes("medium")) {
    riskLevel = "Medium";
  } else if (riskLevelRaw.includes("low")) {
    riskLevel = "Low";
  } else if (hasRiskScore) {
    if (riskScore >= 0.75) riskLevel = "High";
    else if (riskScore >= 0.4) riskLevel = "Medium";
  } else if (confidence >= 80) {
    riskLevel = "High";
  } else if (confidence >= 45) {
    riskLevel = "Medium";
  }

  const tips = data?.tips
    ? data.tips
    : [
        data?.recommendation,
        "Monitor this area for changes in size, color, or shape.",
        "Use broad-spectrum sunscreen SPF 30+ daily.",
        "Schedule periodic skin checks with a certified dermatologist.",
      ].filter(Boolean);

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
