import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Tooltip from "../components/ui/Tooltip";
import RiskBadge from "../components/result/RiskBadge";
import ResultConfidenceChart from "../components/result/ResultConfidenceChart";
import TipsAccordion from "../components/result/TipsAccordion";
import { getLastResult } from "../utils/storage";

const questionLabels = {
  ageBand: "Age group",
  lesionDuration: "How long noticed",
  recentChanges: "Recent change type",
  itching: "Persistent itching",
  bleeding: "Bleeding/crusting",
  pain: "Pain/tenderness",
  scaling: "Flaky/scaly skin",
  ringShape: "Ring-shaped lesion",
  spreading: "Spreading nearby",
  irregularBorder: "Irregular border",
  colorPattern: "Uniform vs multiple colors",
  primaryConcern: "Primary concern",
  contextText: "Extra text context",
  family_history_skin_cancer: "Family history skin cancer",
  previous_skin_cancer: "Previous skin cancer",
  severe_sunburn_history: "Severe sunburn history",
  immunosuppression: "Immunosuppression",
  non_healing: "Non-healing lesion",
  new_vs_old_lesion: "New/different lesion",
  contact_history: "Contact/trauma history",
  pet_exposure: "Pet exposure",
  sweating_occlusion: "Sweating/tight clothing trigger",
  steroid_cream_use: "Steroid cream worsened lesion",
  immune_risk: "Diabetes/immune risk",
  fever: "Fever/chills",
  pus: "Pus/yellow crust",
  trigger_products: "New product trigger",
  allergy_history: "Allergy/eczema history",
  photosensitivity: "Sunlight worsening",
  night_itch: "Night itching",
};

function probabilityToPercent(value) {
  const num = Number(value) || 0;
  if (num <= 1) return Math.round(num * 100);
  return Math.round(Math.min(num, 100));
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

  const activeImage = images[activeImageIndex] || images[0];

  const probabilities = useMemo(() => {
    const pairs = Object.entries(result?.probabilities || {});
    return pairs.map(([label, score]) => ({
      label,
      value: probabilityToPercent(score),
    }));
  }, [result?.probabilities]);

  const downloadReport = () => {
    if (!result) return;

    const payload = [
      "Derma Vision - AI Skin Analysis Report",
      `Generated At: ${new Date().toLocaleString()}`,
      `Images Analyzed: ${images.length || 1}`,
      `Risk Level: ${result.riskLevel}`,
      `Confidence: ${result.confidence}%`,
      `Predicted Class: ${result.predictedClass}`,
      "",
      "Medical Explanation:",
      result.explanation,
      "",
      "Questionnaire-Based Inference:",
      `Estimated Presence: ${result.questionnaireAssessment?.presence || "N/A"}`,
      `Risk Level: ${result.questionnaireAssessment?.level || "N/A"}`,
      `Questionnaire Score: ${
        result.questionnaireAssessment?.score !== undefined
          ? result.questionnaireAssessment.score
          : "N/A"
      }`,
      `Inference Note: ${result.questionnaireAssessment?.message || "N/A"}`,
      ...(result.questionnaireAnswers
        ? [
            "",
            "Questionnaire Answers:",
            ...Object.entries(result.questionnaireAnswers).map(([key, value]) =>
              `${questionLabels[key] || key}: ${value || "N/A"}`
            ),
          ]
        : []),
      ...(result.followupQuestions?.length
        ? [
            "",
            "Suggested Follow-up Questions:",
            ...result.followupQuestions.map((question, index) => `${index + 1}. ${question}`),
          ]
        : []),
      ...(result.followupAnswers
        ? [
            "",
            "Follow-up Answers:",
            ...Object.entries(result.followupAnswers).map(([key, value]) =>
              `${questionLabels[key] || key}: ${value || "N/A"}`
            ),
          ]
        : []),
      "",
      "Health Tips:",
      ...(result.tips || []).map((tip, index) => `${index + 1}. ${tip}`),
    ].join("\n");

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
              {images.length} image{images.length > 1 ? "s" : ""} analyzed for better clarity.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-2 flex items-center gap-2">
                <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Confidence Score</p>
                <Tooltip content="AI confidence for predicted class. Clinical confirmation is required.">
                  <span className="inline-flex h-5 w-5 cursor-help items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    i
                  </span>
                </Tooltip>
              </div>
              <ResultConfidenceChart confidence={result.confidence} />
            </div>
          </div>
          <div className="space-y-3">
            <img
              src={activeImage || result.image}
              alt="Analyzed lesion"
              className="aspect-square w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700"
            />
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
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Measured Questionnaire Outcome
        </h3>
        {result.questionnaireAssessment ? (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-xs font-bold ${
                  result.questionnaireAssessment.level === "High"
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                    : result.questionnaireAssessment.level === "Moderate"
                      ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200"
                      : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200"
                }`}
              >
                {result.questionnaireAssessment.presence}
              </span>
              <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Score: {result.questionnaireAssessment.score}
              </span>
              {result.questionnaireAssessment.answeredAt ? (
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Assessed: {new Date(result.questionnaireAssessment.answeredAt).toLocaleString()}
                </span>
              ) : null}
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-200">
              {result.questionnaireAssessment.message}
            </p>
            {result.questionnaireAssessment.reasons?.length ? (
              <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
                {result.questionnaireAssessment.reasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            ) : null}
            {result.questionnaireAnswers ? (
              <div className="grid gap-2 rounded-xl border border-slate-200 p-3 text-xs dark:border-slate-700 md:grid-cols-2">
                {Object.entries(result.questionnaireAnswers).map(([key, value]) => (
                  <p key={key} className="text-slate-600 dark:text-slate-300">
                    <span className="font-semibold text-slate-700 dark:text-slate-100">
                      {questionLabels[key] || key}:
                    </span>{" "}
                    {value || "N/A"}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Questionnaire was not completed for this scan.
          </p>
        )}
      </Card>

      {result.followupQuestions?.length ? (
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Suggested Follow-up Questions
          </h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            Based on image pattern + submitted context, these questions should be answered next:
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
          <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
            {result.explanation}
          </p>
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
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Heatmap (Placeholder)</h3>
          <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
            <div className="relative overflow-hidden rounded-lg">
              <img
                src={activeImage || result.image}
                alt="heatmap base"
                className="aspect-square w-full object-cover"
              />
              <motion.div
                initial={{ opacity: 0.35 }}
                animate={{ opacity: [0.35, 0.65, 0.35] }}
                transition={{ repeat: Infinity, duration: 2.6 }}
                className="absolute inset-0 bg-gradient-to-tr from-red-500/35 via-transparent to-orange-400/35"
              />
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              Heatmap layer will render lesion attention area from model explainability output.
            </p>
          </div>
        </Card>
      </div>

      <Card>
        <h3 className="mb-3 text-base font-bold text-slate-900 dark:text-slate-100">Personal Health Tips</h3>
        <TipsAccordion tips={result.tips || []} />
      </Card>
    </motion.section>
  );
}

export default ResultPage;
