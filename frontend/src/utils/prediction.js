export function humanizePredictionLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "Unknown";

  return normalized
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function normalizePredictionResponse(data) {
  const status = data?.status || "success";
  const riskScoreRaw = Number(
    data?.risk_score ?? data?.final_risk_score ?? data?.cancer_probability
  );
  const hasRiskScore = Number.isFinite(riskScoreRaw);
  const riskScore = hasRiskScore ? Math.min(1, Math.max(0, riskScoreRaw)) : null;

  const predictedClass =
    humanizePredictionLabel(
      data?.predicted_class ||
      data?.label ||
      data?.prediction ||
      data?.top_label ||
      "Unknown"
    );

  const explanation =
    data?.simple_explanation ||
    data?.explanation ||
    data?.decision ||
    data?.risk_message ||
    "AI analysis is complete. Please consult a dermatologist for final medical diagnosis.";

  const possibleConditions = Array.isArray(data?.possible_conditions)
    ? data.possible_conditions.filter(Boolean).slice(0, 3)
    : [];

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
  }

  const recommendedSteps = Array.isArray(data?.recommended_steps)
    ? data.recommended_steps.filter(Boolean).slice(0, 6)
    : data?.tips
      ? data.tips.filter(Boolean).slice(0, 6)
      : [
          data?.recommendation,
          "Monitor this area for visible changes in size, color, or shape.",
          "Seek medical advice promptly if the lesion worsens.",
        ].filter(Boolean);

  const followupQuestions = Array.isArray(data?.followup?.questions) ? data.followup.questions : [];
  const followupItems = Array.isArray(data?.followup?.items) ? data.followup.items : [];
  const normalizedFollowupItems = followupItems.length
    ? followupItems
    : status !== "success"
      ? followupQuestions.map((question, index) => ({
        key: `followup_${index + 1}`,
        question,
      }))
      : [];

  return {
    status,
    predictedClass,
    explanation,
    riskLevel,
    possibleConditions,
    recommendedSteps,
    followupQuestions,
    followupItems: normalizedFollowupItems,
    backendDetails: data?.details || null,
  };
}

export function getRiskScore(riskLevel) {
  if (riskLevel === "High") return 3;
  if (riskLevel === "Medium") return 2;
  return 1;
}
