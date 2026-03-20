import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import RiskBadge from "../components/result/RiskBadge";
import { getLastResult } from "../utils/storage";
import { useAuth } from "../context/AuthContext";
import { listUserScans } from "../services/scans";

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

function buildNextStepsIntro(riskLevel, possibleConditions) {
  const lead = possibleConditions?.[0] || "this skin pattern";

  if (riskLevel === "High") {
    return `These next steps should be followed promptly because the current pattern may fit ${lead.toLowerCase()}.`;
  }
  if (riskLevel === "Medium") {
    return `These next steps can help you act early while arranging review for a pattern that may fit ${lead.toLowerCase()}.`;
  }
  return `These next steps focus on safe monitoring and practical care for a pattern that may fit ${lead.toLowerCase()}.`;
}

function ResultPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [result, setResult] = useState(() => location.state?.result || getLastResult());
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    if (!location.state?.result) return;
    setResult(location.state.result);
  }, [location.state]);

  useEffect(() => {
    let active = true;

    async function loadLatestScan() {
      if (result || !user?.id) return;

      try {
        const [latestScan] = await listUserScans(user.id, 1);
        if (active && latestScan) {
          setResult(latestScan);
        }
      } catch {
        // Keep the empty state if history is not available.
      }
    }

    loadLatestScan();
    return () => {
      active = false;
    };
  }, [result, user?.id]);

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
  const possibleConditions = Array.isArray(result?.possibleConditions) ? result.possibleConditions : [];
  const recommendedSteps = Array.isArray(result?.recommendedSteps) ? result.recommendedSteps : [];
  const nextStepsIntro = buildNextStepsIntro(result?.riskLevel, possibleConditions);

  const downloadReport = () => {
    if (!result) return;

    const payload = [
      "DermaVision - Skin Screening Report",
      `Generated At: ${new Date().toLocaleString()}`,
      `Images Analyzed: ${images.length || 1}`,
      `Risk Level: ${result.riskLevel}`,
      "",
      "Possible Conditions:",
      ...(possibleConditions.length ? possibleConditions.map((item, index) => `${index + 1}. ${item}`) : ["Not available"]),
      "",
      "Simple Explanation:",
      result.explanation || "Not available",
      "",
      "Recommended Next Steps:",
      ...(recommendedSteps.length ? recommendedSteps.map((item, index) => `${index + 1}. ${item}`) : ["Not available"]),
      "",
      "Clinical Context:",
      result.contextText || result.contextPayload?.context_text || "Not provided",
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
      "It is safe, accessible skin screening tool, not a diagnostic system.",
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
          Start a scan to generate your skin screening report.
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
        <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
                Skin Risk Screening Result
              </h2>
              <RiskBadge riskLevel={result.riskLevel} />
            </div>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {images.length} image{images.length > 1 ? "s" : ""} analyzed with your written description.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Risk Level
                </p>
                <p className="mt-2 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
                  {result.riskLevel}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Top Signal
                </p>
                <p className="mt-2 text-lg font-bold text-slate-900 dark:text-slate-100">
                  {result.predictedClass}
                </p>
              </div>
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

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Possible Conditions</h3>
          {possibleConditions.length ? (
            <div className="mt-3 space-y-2">
              {possibleConditions.map((condition, index) => (
                <div
                  key={condition}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                >
                  {index + 1}. {condition}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              Possible conditions are not available for this scan yet.
            </p>
          )}
        </Card>

        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recommended Next Steps</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{nextStepsIntro}</p>
          {recommendedSteps.length ? (
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-200">
              {recommendedSteps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
              No follow-up steps available for this scan.
            </p>
          )}
        </Card>
      </div>

      <Card>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Simple Explanation</h3>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {result.explanation || "No explanation available for this scan."}
        </p>
      </Card>

      <Card>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Clinical Description Used</h3>
        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {result.contextText || result.contextPayload?.context_text || "No description stored for this scan."}
        </p>
      </Card>

      {result.followupQuestions?.length ? (
        <Card>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Follow-up Questions Asked</h3>
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
    </motion.section>
  );
}

export default ResultPage;
