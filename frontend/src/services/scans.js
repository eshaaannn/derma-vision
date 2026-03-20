import { supabase } from "../lib/supabase";
import { getRiskScore } from "../utils/prediction";

function toTitleCase(value, fallback = "Low") {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function buildFallbackFollowupItems(followupAnswers) {
  if (!followupAnswers || typeof followupAnswers !== "object") {
    return [];
  }

  return Object.keys(followupAnswers).map((key) => ({
    key,
    question: key.replace(/_/g, " "),
  }));
}

function normalizeAiImageBreakdown(items, fallbackLabel) {
  if (!Array.isArray(items)) return [];

  return items.map((item, index) => ({
    imageNumber: Number(item?.image_number) || index + 1,
    predictedClass: item?.predicted_class || fallbackLabel,
    riskLevel: toTitleCase(item?.risk_level),
  }));
}

function buildRecommendationFallback(riskLevel, possibleConditions, context) {
  const conditionText = possibleConditions.join(" ").toLowerCase();
  const ringShape = context?.ring_shape === true;
  const scaling = context?.scaling === true;
  const itching = context?.itching === true;
  const pain = context?.pain === true;
  const bleeding = context?.bleeding === true;
  const rapidGrowth = context?.rapid_growth === true;
  const fever = context?.fever === true;
  const pus = context?.pus === true;

  const steps = [];

  if (riskLevel === "High" || bleeding || rapidGrowth) {
    steps.push("Arrange an in-person dermatology or medical review within 24-72 hours.");
    steps.push("If the area is bleeding, rapidly changing, or not healing, do not delay getting it checked.");
    steps.push("Take clear photos today so you can compare changes before your appointment.");
    steps.push("Avoid self-treating with strong creams or acids unless a clinician advises it.");
  } else if (riskLevel === "Medium" || pain || fever || pus) {
    steps.push("Book a dermatology or primary-care review within 5-7 days.");
    steps.push("Check the area daily for spreading, pain, discharge, bleeding, or color change.");
    steps.push("Take a clear baseline photo now so you can compare it over the next few days.");
    steps.push("Avoid picking, squeezing, or using harsh treatments until it is reviewed.");
  } else {
    steps.push("Monitor the area over the next 2-4 weeks and watch for changes in size, color, shape, or symptoms.");
    steps.push("Repeat screening or arrange a medical review sooner if it worsens before that time.");
    steps.push("Take a baseline photo today so you can compare it later.");
    steps.push("Use gentle skin care and avoid irritation while observing it.");
  }

  if (conditionText.includes("fungal") || conditionText.includes("ringworm") || ringShape || (scaling && itching)) {
    steps.push("Because the pattern may be fungal, keep the area dry and avoid sharing towels or clothing.");
  } else if (conditionText.includes("bacterial") || conditionText.includes("folliculitis") || fever || pus) {
    steps.push("Because the pattern may be infectious, seek review sooner if you notice spreading redness, pus, fever, or worsening pain.");
  } else if (conditionText.includes("suspicious") || conditionText.includes("melanoma")) {
    steps.push("Because the pattern includes suspicious features, prioritize clinician review rather than relying only on self-monitoring.");
  }

  return steps.slice(0, 6);
}

function buildRecommendedSteps(metadata, riskLevel) {
  if (Array.isArray(metadata?.recommended_steps) && metadata.recommended_steps.length) {
    return metadata.recommended_steps.filter(Boolean).slice(0, 6);
  }

  const fallback = buildRecommendationFallback(
    riskLevel,
    Array.isArray(metadata?.possible_conditions) ? metadata.possible_conditions : [],
    metadata?.context || {}
  );

  if (metadata?.recommendation) {
    return [metadata.recommendation, ...fallback.filter((step) => step !== metadata.recommendation)].slice(0, 6);
  }

  return fallback;
}

export function mapScanRowToScan(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const images = Array.isArray(metadata.image_previews)
    ? metadata.image_previews.filter((entry) => typeof entry === "string" && entry.trim())
    : [];
  const primaryImage = metadata.image_preview || images[0] || null;
  const riskLevel = toTitleCase(row?.risk_level);
  const predictedClass = row?.top_label || "Unknown";
  const followupItems = Array.isArray(metadata.followup_items)
    ? metadata.followup_items
    : buildFallbackFollowupItems(metadata.followup_answers);
  const followupQuestions = Array.isArray(metadata.followup_questions)
    ? metadata.followup_questions
    : followupItems.map((item) => item.question);

  return {
    id: row?.id,
    createdAt: row?.created_at,
    image: primaryImage,
    images: images.length ? images : primaryImage ? [primaryImage] : [],
    analyzedImageCount: Number(metadata.image_count) || images.length || (primaryImage ? 1 : 0),
    predictedClass,
    explanation:
      metadata.simple_explanation ||
      metadata.explanation ||
      metadata.risk_message ||
      "AI analysis is complete. Please consult a dermatologist for final medical diagnosis.",
    riskLevel,
    possibleConditions: Array.isArray(metadata.possible_conditions) ? metadata.possible_conditions : [],
    recommendedSteps: buildRecommendedSteps(metadata, riskLevel),
    riskScore: getRiskScore(riskLevel),
    contextText: metadata.context?.context_text || "",
    contextPayload: metadata.context || null,
    followupQuestions,
    followupItems,
    followupAnswers: metadata.followup_answers || null,
    backendStatus: row?.status || "success",
    topLabel: predictedClass,
    backendDetails: metadata.backend_details || null,
    modelExplainability: metadata.model_explainability || null,
    aiImageBreakdown: normalizeAiImageBreakdown(metadata.ai_image_breakdown, predictedClass),
  };
}

export async function listUserScans(userId, limit = 50) {
  if (!userId) return [];

  const { data, error } = await supabase
    .from("scan_results")
    .select("id,created_at,risk_level,risk_score,top_label,status,metadata")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data || []).map(mapScanRowToScan);
}

export async function deleteUserScan(scanId, userId) {
  let query = supabase.from("scan_results").delete().eq("id", scanId);
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { error } = await query;
  if (error) {
    throw error;
  }
}
