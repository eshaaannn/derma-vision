import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Tooltip from "../components/ui/Tooltip";
import RiskBadge from "../components/result/RiskBadge";
import ResultConfidenceChart from "../components/result/ResultConfidenceChart";
import { getLastResult } from "../utils/storage";

const questionLabels = {
  contextText: "Clinical context",
  duration_days: "How many days",
  rapid_growth: "Rapid growth",
  bleeding: "Bleeding or crusting",
  itching: "Persistent itching",
  pain: "Pain or tenderness",
  spreading: "Spreading pattern",
  ring_shape: "Ring-shaped lesion",
  scaling: "Scaling/flaky skin",
  irregular_border: "Irregular border",
  multi_color: "Multiple color tones",
  family_history_skin_cancer: "Family history of skin cancer",
  previous_skin_cancer: "Previous skin cancer",
  severe_sunburn_history: "Severe sunburn history",
  immunosuppression: "Immunosuppression",
  non_healing: "Non-healing lesion",
  new_vs_old_lesion: "New or different lesion",
  contact_history: "Relevant contact history",
  pet_exposure: "Pet/animal exposure",
  sweating_occlusion: "Sweat or occlusion trigger",
  steroid_cream_use: "Steroid cream worsening",
  immune_risk: "Diabetes or immune risk",
  fever: "Fever/chills",
  pus: "Pus/yellow crust",
  trigger_products: "Product trigger",
  allergy_history: "Allergy/eczema history",
  photosensitivity: "Sunlight worsening",
  night_itch: "Night-time itching",
};

function probabilityToPercent(value) {
  const num = Number(value) || 0;
  if (num <= 1) return Math.round(num * 100);
  return Math.round(Math.min(num, 100));
}

function resolveHeatmapSrc(modelExplainability) {
  const candidate =
    modelExplainability?.heatmap || modelExplainability?.gradcam || modelExplainability?.cam || null;

  if (!candidate || typeof candidate !== "string") {
    return null;
  }

  const trimmed = candidate.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("data:image")) {
    return trimmed;
  }

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `data:image/png;base64,${trimmed}`;
}

function inferVisualFeatures(result) {
  const label = String(result?.predictedClass || result?.topLabel || "").toLowerCase();
  const contextText = String(result?.contextText || result?.contextPayload?.context_text || "").toLowerCase();
  const patternReason = String(result?.modelExplainability?.visual_pattern?.reason || "").toLowerCase();
  const contributingFactors = Array.isArray(result?.backendDetails?.contributing_factors)
    ? result.backendDetails.contributing_factors.join(" ").toLowerCase()
    : "";
  const features = new Set();

  if (label.includes("cancer") || label.includes("melan") || label.includes("suspicious")) {
    features.add("asymmetry cues");
    features.add("border irregularity");
    features.add("pigmentation variation");
  }

  if (label.includes("fung") || label.includes("tinea") || label.includes("ringworm")) {
    features.add("annular pattern tendency");
    features.add("surface scaling texture");
    features.add("peripheral spread pattern");
  }

  if (label.includes("bacter") || label.includes("impetigo") || label.includes("follic")) {
    features.add("localized inflammatory texture");
    features.add("surface crusting cues");
  }

  if (label.includes("inflamm") || label.includes("eczema") || label.includes("rash")) {
    features.add("diffuse inflammatory pattern");
    features.add("surface irritation markers");
  }

  if (contextText.includes("irregular") || contextText.includes("uneven")) {
    features.add("border irregularity");
  }
  if (contextText.includes("multiple color") || contextText.includes("variegated")) {
    features.add("pigmentation variation");
  }
  if (contextText.includes("itch") || contextText.includes("scal")) {
    features.add("surface scaling texture");
  }

  if (patternReason.includes("high_contrast") || patternReason.includes("dark")) {
    features.add("high-contrast pigmentation");
  }
  if (patternReason.includes("annular") || patternReason.includes("ring")) {
    features.add("annular pattern tendency");
  }
  if (contributingFactors.includes("irregular border")) {
    features.add("border irregularity");
  }
  if (contributingFactors.includes("multiple colors")) {
    features.add("pigmentation variation");
  }
  if (contributingFactors.includes("ring-shaped")) {
    features.add("annular pattern tendency");
  }

  if (!features.size) {
    features.add("lesion boundary pattern");
    features.add("pigmentation distribution");
    features.add("texture contrast");
  }

  return Array.from(features).slice(0, 3);
}

function buildProbabilitySummary(result) {
  const riskLevel = String(result?.riskLevel || "Low");
  const readableRisk = riskLevel.toLowerCase() === "medium" ? "moderate" : riskLevel.toLowerCase();
  const features = inferVisualFeatures(result);

  return `This result indicates a ${readableRisk} probability based on image pattern analysis such as ${features.join(
    ", "
  )}. This is a probability-based estimation and not a confirmed diagnosis.`;
}

function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();

  const [result, setResult] = useState(() => location.state?.result || getLastResult());
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!location.state?.result) return;
    setResult(location.state.result);
  }, [location.state]);

  const images = useMemo(() => {
    if (!result) return [];
    if (Array.isArray(result.images) && result.images.length) return result.images;
    if (result.image) return [result.image];
    return [];
  }, [result]);

  useEffect(() => {
    if (activeImageIndex > images.length - 1) {
      setActiveImageIndex(0);
    }
  }, [activeImageIndex, images.length]);

  const activeImage = images[activeImageIndex] || images[0] || null;
  const heatmapSrc = useMemo(() => resolveHeatmapSrc(result?.modelExplainability), [result?.modelExplainability]);

  const probabilities = useMemo(() => {
    const pairs = Object.entries(result?.probabilities || {});
    return pairs.map(([label, score]) => ({
      label,
      value: probabilityToPercent(score),
    }));
  }, [result?.probabilities]);

  const probabilitySummary = useMemo(() => buildProbabilitySummary(result), [result]);

  const downloadReport = () => {
    if (!result) return;

    const payload = [
      "DermaVision - AI Skin Screening Report",
      `Generated At: ${new Date().toLocaleString()}`,
      `Images Analyzed: ${images.length || 1}`,
      `Risk Level: ${result.riskLevel}`,
      `Confidence: ${result.confidence}%`,
      `Predicted Class: ${result.predictedClass}`,
      "",
      "Probability-Based Medical Explanation:",
      probabilitySummary,
      result.explanation ? `Model Output: ${result.explanation}` : null,
      "",
      "Clinical Context:",
      result.contextText || result.contextPayload?.context_text || "Not provided",
      ...(result.followupQuestions?.length
        ? [
            "",
            "Follow-up Questions Asked:",
            ...result.followupQuestions.map((question, index) => `${index + 1}. ${question}`),
          ]
        : []),
      ...(result.followupAnswers
        ? [
            "",
            "Follow-up Answers Used:",
            ...Object.entries(result.followupAnswers).map(
              ([key, value]) => `${questionLabels[key] || key}: ${value || "N/A"}`
            ),
          ]
        : []),
      "",
      "Disclaimer: This platform provides AI-based probability predictions and does not confirm or diagnose cancer.",
    ]
      .filter(Boolean)
      .join("\n");

    const blob = new Blob([payload], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `derma_vision_report_${Date.now()}.txt`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  if (!result) {
    return (
      <Card>
        <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">No result available</h2>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          Start a scan to generate your AI prediction report.
        </p>
        <Button className="mt-4" onClick={() => navigate("/scan")}>
          Go to Scan
        </Button>
      </Card>
    );
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <Card className="overflow-hidden">
        <div className="grid gap-4 lg:grid-cols-[1.4fr,1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                AI Prediction Result
              </h2>
              <RiskBadge riskLevel={result.riskLevel} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              Detected class: <span className="font-semibold">{result.predictedClass}</span>
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {images.length} image{images.length > 1 ? "s" : ""} analyzed.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Confidence Score</p>
                <Tooltip content="Predicted-class probability from model inference (softmax-based).">
                  <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    i
                  </span>
                </Tooltip>
              </div>
              <ResultConfidenceChart confidence={result.confidence} />
            </div>
          </div>
          <div className="space-y-3">
            {activeImage ? (
              <img
                src={activeImage}
                alt="Analyzed lesion"
                className="aspect-square w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                Source image unavailable for this saved scan
              </div>
            )}
            {images.length > 1 ? (
              <div className="grid grid-cols-4 gap-2">
                {images.map((image, index) => (
                  <button
                    key={`${image}-${index}`}
                    type="button"
                    onClick={() => setActiveImageIndex(index)}
                    className={`overflow-hidden rounded-lg border ${
                      index === activeImageIndex
                        ? "border-medicalBlue ring-2 ring-blue-200 dark:ring-blue-800"
                        : "border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    <img src={image} alt={`scan ${index + 1}`} className="aspect-square w-full object-cover" />
                  </button>
                ))}
              </div>
            ) : null}
            <Button className="w-full" onClick={downloadReport}>
              Download Report
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Clinical Context Used</h3>
        <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {result.contextText || result.contextPayload?.context_text || "No context stored for this scan."}
        </p>
      </Card>

      {result.followupQuestions?.length ? (
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Condition-Aware Follow-up Questions</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            These were generated from image pattern and clinical context.
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-slate-700 dark:text-slate-200">
            {result.followupQuestions.map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Card>
      ) : null}

      {result.followupAnswers ? (
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Follow-up Answers Used</h3>
          <div className="mt-3 grid gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700 md:grid-cols-2">
            {Object.entries(result.followupAnswers).map(([key, value]) => (
              <p key={key} className="text-slate-600 dark:text-slate-300">
                <span className="font-semibold text-slate-700 dark:text-slate-100">
                  {questionLabels[key] || key}:
                </span>{" "}
                {value || "N/A"}
              </p>
            ))}
          </div>
        </Card>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Medical Explanation</h3>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-slate-200">{probabilitySummary}</p>
          {result.explanation ? (
            <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-6 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {result.explanation}
            </p>
          ) : null}

          {probabilities.length ? (
            <div className="mt-4 space-y-3">
              {probabilities.map((entry) => (
                <div key={entry.label}>
                  <div className="mb-1 flex justify-between text-xs font-semibold text-slate-600 dark:text-slate-300">
                    <span>{entry.label}</span>
                    <span>{entry.value}%</span>
                  </div>
                  <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${entry.value}%` }}
                      transition={{ duration: 0.7 }}
                      className="h-full rounded-full bg-gradient-to-r from-medicalBlue to-healthGreen"
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Grad-CAM Heatmap</h3>
          {heatmapSrc && activeImage ? (
            <div className="mt-3 space-y-3">
              <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
                <img
                  src={activeImage}
                  alt="Analyzed lesion"
                  className="aspect-square w-full object-cover"
                />
                <img
                  src={heatmapSrc}
                  alt="Grad-CAM overlay"
                  className="absolute inset-0 aspect-square h-full w-full object-cover opacity-60 mix-blend-multiply"
                />
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
                <img src={heatmapSrc} alt="Grad-CAM heatmap" className="aspect-square w-full rounded-lg object-cover" />
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Heatmap highlights image regions that most influenced model probability scoring.
              </p>
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Heatmap not available for this scan output.
            </p>
          )}
        </Card>
      </div>
    </motion.section>
  );
}

export default ResultPage;
