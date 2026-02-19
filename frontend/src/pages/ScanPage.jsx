import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Button from "../components/ui/Button";
import Card from "../components/ui/Card";
import Loader from "../components/ui/Loader";
import DropzoneUpload from "../components/scan/DropzoneUpload";
import CameraCapture from "../components/scan/CameraCapture";
import ImageCropperModal from "../components/scan/ImageCropperModal";
import UploadProgress from "../components/scan/UploadProgress";
import CancerQuestionnaire from "../components/scan/CancerQuestionnaire";
import { dataUrlToFile, fileToDataUrl } from "../utils/cropImage";
import { addScan, saveLastResult } from "../utils/storage";
import { predictLesionEnhanced } from "../services/api";
import { getRiskScore, normalizePredictionResponse } from "../utils/prediction";
import { useToast } from "../context/ToastContext";
import { createId } from "../utils/id";
import {
  buildEnhancedContext,
  QUESTIONNAIRE_DEFAULTS,
  evaluateCancerQuestionnaire,
  isQuestionnaireComplete,
} from "../utils/questionnaire";

function generateDemoPrediction() {
  const confidence = Math.floor(Math.random() * 45) + 52;
  const riskLevel = confidence > 78 ? "High" : confidence > 60 ? "Medium" : "Low";
  return {
    confidence,
    predictedClass: riskLevel === "High" ? "Suspicious Lesion" : "Benign Lesion",
    explanation:
      "Demo result generated because API was unreachable. Connect backend to /predict for real inference.",
    riskLevel,
    probabilities: {
      Benign: riskLevel === "Low" ? 0.76 : 0.31,
      Melanoma: riskLevel === "High" ? 0.72 : 0.24,
    },
    tips: [
      "Capture images in natural light for improved accuracy.",
      "Track lesion changes every 2-4 weeks.",
      "Seek dermatologist consultation for persistent concerns.",
    ],
  };
}

function mergeProbabilities(results) {
  const summary = {};
  results.forEach((result) => {
    Object.entries(result.probabilities || {}).forEach(([label, value]) => {
      summary[label] = summary[label] || { total: 0, count: 0 };
      summary[label].total += Number(value) || 0;
      summary[label].count += 1;
    });
  });

  return Object.fromEntries(
    Object.entries(summary).map(([label, entry]) => [
      label,
      entry.count ? entry.total / entry.count : 0,
    ])
  );
}

function aggregatePredictions(results) {
  if (!results.length) {
    return generateDemoPrediction();
  }
  if (results.length === 1) {
    return results[0];
  }

  const riskRank = { Low: 1, Medium: 2, High: 3 };
  const highestRisk = [...results].sort(
    (a, b) => (riskRank[b.riskLevel] || 1) - (riskRank[a.riskLevel] || 1)
  )[0];
  const highestConfidence = [...results].sort((a, b) => b.confidence - a.confidence)[0];
  const averageConfidence =
    results.reduce((total, result) => total + (Number(result.confidence) || 0), 0) / results.length;
  const mergedTips = Array.from(new Set(results.flatMap((result) => result.tips || [])));

  return {
    confidence: Number(averageConfidence.toFixed(1)),
    predictedClass: highestConfidence.predictedClass,
    explanation: `Combined analysis from ${results.length} images indicates ${highestRisk.riskLevel.toLowerCase()} risk. ${highestConfidence.explanation}`,
    riskLevel: highestRisk.riskLevel,
    probabilities: mergeProbabilities(results),
    tips: mergedTips,
  };
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function fusePredictionWithQuestionnaire(aiPrediction, assessment) {
  if (!assessment) return aiPrediction;

  const riskToScore = { Low: 1, Medium: 2, High: 3 };
  const scoreToRisk = (score) => {
    if (score >= 2.5) return "High";
    if (score >= 1.75) return "Medium";
    return "Low";
  };

  const aiRiskScore = riskToScore[aiPrediction.riskLevel] || 1;
  const questionnaireBoost =
    assessment.level === "High" ? 1 : assessment.level === "Moderate" ? 0.5 : -0.2;
  const fusedRiskScore = clamp(aiRiskScore + questionnaireBoost, 1, 3);
  const fusedRiskLevel = scoreToRisk(fusedRiskScore);

  const questionnaireConfidence = clamp((assessment.score / 15) * 100, 0, 100);
  const fusedConfidence = clamp(
    Math.round((aiPrediction.confidence || 0) * 0.85 + questionnaireConfidence * 0.15),
    30,
    99
  );

  return {
    ...aiPrediction,
    confidence: fusedConfidence,
    riskLevel: fusedRiskLevel,
    explanation:
      `${aiPrediction.explanation} Combined with questionnaire signal (${assessment.presence}, score ${assessment.score}) for final calibrated risk.`,
  };
}

function ScanPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();

  const [images, setImages] = useState([]);
  const [selectedImageId, setSelectedImageId] = useState(null);
  const [cropTargetId, setCropTargetId] = useState(null);
  const [sourceImageUrl, setSourceImageUrl] = useState("");
  const [showCropper, setShowCropper] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeMode, setActiveMode] = useState("upload");
  const [error, setError] = useState("");
  const [canUseDemo, setCanUseDemo] = useState(false);
  const [questionnaire, setQuestionnaire] = useState({ ...QUESTIONNAIRE_DEFAULTS });
  const [followupItems, setFollowupItems] = useState([]);
  const [followupAnswers, setFollowupAnswers] = useState({});
  const [pendingContextPayload, setPendingContextPayload] = useState(null);
  const [pendingQuestionnaireAssessment, setPendingQuestionnaireAssessment] = useState(null);
  const imagesRef = useRef([]);

  const hasImages = useMemo(() => images.length > 0, [images.length]);
  const questionnaireComplete = useMemo(
    () => isQuestionnaireComplete(questionnaire),
    [questionnaire]
  );
  const questionnaireAssessment = useMemo(
    () => (questionnaireComplete ? evaluateCancerQuestionnaire(questionnaire) : null),
    [questionnaire, questionnaireComplete]
  );
  const selectedImage = useMemo(
    () => images.find((image) => image.id === selectedImageId) || images[0] || null,
    [images, selectedImageId]
  );
  const awaitingFollowup = useMemo(() => followupItems.length > 0, [followupItems.length]);
  const followupComplete = useMemo(
    () =>
      followupItems.every((item) => {
        const raw = followupAnswers[item.key];
        return typeof raw === "string" ? raw.trim().length > 0 : Boolean(raw);
      }),
    [followupAnswers, followupItems]
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => {
    if (images.length && !images.some((image) => image.id === selectedImageId)) {
      setSelectedImageId(images[0].id);
    }
    if (!images.length && selectedImageId) {
      setSelectedImageId(null);
    }
  }, [images, selectedImageId]);

  useEffect(() => {
    return () => {
      imagesRef.current.forEach((image) => {
        if (image.previewUrl?.startsWith("blob:")) {
          URL.revokeObjectURL(image.previewUrl);
        }
      });
    };
  }, []);

  const clearFollowupState = () => {
    setFollowupItems([]);
    setFollowupAnswers({});
    setPendingContextPayload(null);
    setPendingQuestionnaireAssessment(null);
  };

  const handleIncomingFiles = (files) => {
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!validFiles.length) return;

    setError("");
    setCanUseDemo(false);
    clearFollowupState();

    const nextImages = validFiles.map((file) => ({
      id: createId("scan_image"),
      file,
      previewUrl: URL.createObjectURL(file),
    }));

    setImages((current) => [...current, ...nextImages]);
    if (!selectedImageId) {
      setSelectedImageId(nextImages[0].id);
    }

    setCropTargetId(nextImages[0].id);
    setSourceImageUrl(nextImages[0].previewUrl);
    setShowCropper(true);
  };

  const handleCameraCapture = (dataUrl) => {
    const file = dataUrlToFile(dataUrl);
    handleIncomingFiles([file]);
  };

  const openCropperForImage = (imageId) => {
    const target = images.find((image) => image.id === imageId);
    if (!target) return;
    setCropTargetId(target.id);
    setSourceImageUrl(target.previewUrl);
    setShowCropper(true);
  };

  const removeImage = (imageId) => {
    clearFollowupState();
    setImages((current) => {
      const target = current.find((image) => image.id === imageId);
      if (target?.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return current.filter((image) => image.id !== imageId);
    });
  };

  const resetSelection = () => {
    images.forEach((image) => {
      if (image.previewUrl?.startsWith("blob:")) {
        URL.revokeObjectURL(image.previewUrl);
      }
    });
    setImages([]);
    setSelectedImageId(null);
    setCropTargetId(null);
    setSourceImageUrl("");
    setShowCropper(false);
    setUploadProgress(0);
    setError("");
    setCanUseDemo(false);
    setQuestionnaire({ ...QUESTIONNAIRE_DEFAULTS });
    clearFollowupState();
  };

  const finalizeResult = async (
    normalized,
    perImageResults,
    finalQuestionnaireAssessment,
    contextPayload,
    backendResponse,
    followupAnswerPayload = null
  ) => {
    const persistentImages = await Promise.all(images.map((image) => fileToDataUrl(image.file)));
    const scan = {
      id: createId("scan"),
      createdAt: new Date().toISOString(),
      image: persistentImages[0],
      images: persistentImages,
      analyzedImageCount: persistentImages.length,
      confidence: Math.round(normalized.confidence),
      predictedClass: normalized.predictedClass,
      explanation: normalized.explanation,
      riskLevel: normalized.riskLevel,
      tips: normalized.tips,
      probabilities: normalized.probabilities,
      riskScore: getRiskScore(normalized.riskLevel),
      questionnaireAnswers: { ...questionnaire },
      contextPayload,
      questionnaireAssessment: finalQuestionnaireAssessment
        ? { ...finalQuestionnaireAssessment, answeredAt: new Date().toISOString() }
        : null,
      followupQuestions:
        normalized.followupQuestions?.length
          ? normalized.followupQuestions
          : followupItems.map((item) => item.question),
      followupItems: normalized.followupItems?.length ? normalized.followupItems : followupItems,
      followupAnswers: followupAnswerPayload,
      backendStatus: backendResponse?.status || "success",
      topLabel: backendResponse?.top_label || normalized.predictedClass,
      modelExplainability: backendResponse?.model_explainability || null,
      aiImageBreakdown: perImageResults.map((entry, index) => ({
        imageNumber: index + 1,
        confidence: Math.round(entry.confidence),
        predictedClass: entry.predictedClass,
        riskLevel: entry.riskLevel,
      })),
    };

    addScan(scan);
    saveLastResult(scan);
    navigate("/result", { state: { result: scan } });
  };

  const buildPerImageResults = (response, normalized) => {
    const perImageScores = Array.isArray(response?.details?.individual_scores)
      ? response.details.individual_scores
      : [];
    return images.map((_, index) => {
      const score = Number(perImageScores[index]);
      const safeScore = Number.isFinite(score) ? Math.min(1, Math.max(0, score)) : null;
      const riskLevel =
        safeScore === null
          ? normalized.riskLevel
          : safeScore >= 0.75
            ? "High"
            : safeScore >= 0.4
              ? "Medium"
              : "Low";
      return {
        confidence: safeScore === null ? normalized.confidence : safeScore * 100,
        predictedClass: normalized.predictedClass,
        riskLevel,
      };
    });
  };

  const analyzeImages = async () => {
    if (!images.length) {
      setError("Please upload at least one image before analysis.");
      return;
    }
    if (awaitingFollowup) {
      setError("Please answer follow-up questions to get final prediction.");
      return;
    }
    if (!questionnaireComplete) {
      setError("Please complete the image context form before AI analysis.");
      showToast({
        type: "warning",
        title: "Context Incomplete",
        message: "Answer all questionnaire fields to continue.",
      });
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setCanUseDemo(false);
    setUploadProgress(0);

    try {
      const finalQuestionnaireAssessment = evaluateCancerQuestionnaire(questionnaire);
      const contextPayload = buildEnhancedContext(questionnaire);
      clearFollowupState();
      const response = await predictLesionEnhanced(
        images.map((image) => image.file),
        contextPayload,
        {},
        (event) => {
          if (!event.total) return;
          const percent = (event.loaded / event.total) * 95;
          setUploadProgress(Math.round(Math.min(percent, 95)));
        }
      );

      if (response?.status && response.status !== "success") {
        const followups = Array.isArray(response?.followup?.questions)
          ? response.followup.questions
          : [];
        const fallbackMessage = "Analysis could not complete. Please retake clear images and try again.";
        setError(response?.message || fallbackMessage);
        if (followups.length) {
          showToast({
            type: "warning",
            title: "More Context Needed",
            message: followups[0],
          });
        }
        return;
      }

      const normalized = normalizePredictionResponse(response);
      const followupFromApi = Array.isArray(normalized.followupItems)
        ? normalized.followupItems.filter((item) => item?.key && item?.question).slice(0, 6)
        : [];

      if (followupFromApi.length) {
        setFollowupItems(followupFromApi);
        setFollowupAnswers(
          Object.fromEntries(followupFromApi.map((item) => [item.key, ""]))
        );
        setPendingContextPayload(contextPayload);
        setPendingQuestionnaireAssessment(finalQuestionnaireAssessment);
        setUploadProgress(100);
        showToast({
          type: "warning",
          title: "Follow-up Required",
          message: "Step 2: answer the relevant follow-up questions to get final prediction.",
        });
        return;
      }

      const perImageResults = buildPerImageResults(response, normalized);

      setUploadProgress(100);
      showToast({
        type: "success",
        title: "Analysis Complete",
        message: `Final prediction generated from ${images.length} image(s) + provided context.`,
      });
      await finalizeResult(
        normalized,
        perImageResults,
        finalQuestionnaireAssessment,
        contextPayload,
        response,
        null
      );
    } catch (apiError) {
      setError("Could not reach prediction API. You can retry or continue with demo data.");
      setCanUseDemo(true);
      showToast({
        type: "error",
        title: "Prediction Failed",
        message: apiError?.message || "API error while analyzing images.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const submitFollowupForFinalPrediction = async () => {
    if (!awaitingFollowup) {
      return;
    }
    if (!followupComplete) {
      setError("Please answer all follow-up questions before final prediction.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setUploadProgress(0);

    const contextPayload = pendingContextPayload || buildEnhancedContext(questionnaire);
    const finalQuestionnaireAssessment =
      pendingQuestionnaireAssessment || evaluateCancerQuestionnaire(questionnaire);

    try {
      const response = await predictLesionEnhanced(
        images.map((image) => image.file),
        contextPayload,
        followupAnswers,
        (event) => {
          if (!event.total) return;
          const percent = (event.loaded / event.total) * 95;
          setUploadProgress(Math.round(Math.min(percent, 95)));
        }
      );

      if (response?.status && response.status !== "success") {
        setError(response?.message || "Could not complete final prediction.");
        return;
      }

      const normalized = normalizePredictionResponse(response);
      const perImageResults = buildPerImageResults(response, normalized);
      setUploadProgress(100);
      showToast({
        type: "success",
        title: "Final Prediction Ready",
        message: "Final score updated using follow-up answers.",
      });
      await finalizeResult(
        normalized,
        perImageResults,
        finalQuestionnaireAssessment,
        contextPayload,
        response,
        { ...followupAnswers }
      );
      clearFollowupState();
    } catch (apiError) {
      setError("Could not process follow-up answers right now. Please retry.");
      showToast({
        type: "error",
        title: "Final Prediction Failed",
        message: apiError?.message || "API error while processing follow-up answers.",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const useDemoResult = async () => {
    const finalQuestionnaireAssessment = evaluateCancerQuestionnaire(questionnaire);
    const demoPredictions = images.map(() => generateDemoPrediction());
    const contextPayload = buildEnhancedContext(questionnaire);
    const merged = aggregatePredictions(demoPredictions);
    const fused = fusePredictionWithQuestionnaire(merged, finalQuestionnaireAssessment);
    showToast({
      type: "warning",
      title: "Demo Mode",
      message: "Showing simulated result because API was unavailable.",
    });
    await finalizeResult(fused, demoPredictions, finalQuestionnaireAssessment, contextPayload, null);
  };

  const handleQuestionAnswer = (key, value) => {
    if (awaitingFollowup) {
      clearFollowupState();
    }
    setQuestionnaire((current) => ({ ...current, [key]: value }));
    setError("");
  };

  const handleFollowupAnswer = (key, value) => {
    setFollowupAnswers((current) => ({ ...current, [key]: value }));
    setError("");
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setActiveMode("upload")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              activeMode === "upload"
                ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            Upload from Device
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("camera")}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              activeMode === "camera"
                ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
            }`}
          >
            Scan with Camera
          </button>
        </div>

        {activeMode === "upload" ? (
          <DropzoneUpload onFilesSelect={handleIncomingFiles} />
        ) : (
          <CameraCapture onCapture={handleCameraCapture} />
        )}
      </Card>

      {hasImages ? (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-200">
              Selected Images ({images.length})
            </h3>
            {images.length > 1 ? (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200">
                Multi-angle analysis enabled
              </span>
            ) : null}
          </div>

          {selectedImage ? (
            <img
              src={selectedImage.previewUrl}
              alt="Selected lesion preview"
              className="mx-auto aspect-square w-full max-w-sm rounded-xl border border-slate-200 object-cover dark:border-slate-700"
            />
          ) : null}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {images.map((image, index) => (
              <div
                key={image.id}
                className={`rounded-xl border p-2 ${
                  selectedImage?.id === image.id
                    ? "border-medicalBlue bg-blue-50/70 dark:border-blue-500 dark:bg-blue-900/20"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              >
                <button
                  type="button"
                  onClick={() => setSelectedImageId(image.id)}
                  className="w-full"
                >
                  <img
                    src={image.previewUrl}
                    alt={`Lesion ${index + 1}`}
                    className="aspect-square w-full rounded-lg object-cover"
                  />
                </button>
                <div className="mt-2 flex gap-2">
                  <Button
                    variant="ghost"
                    className="w-full px-2 py-1.5 text-xs"
                    onClick={() => openCropperForImage(image.id)}
                  >
                    Crop
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full px-2 py-1.5 text-xs"
                    onClick={() => removeImage(image.id)}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={analyzeImages}
              loading={isAnalyzing}
              disabled={!questionnaireComplete || awaitingFollowup}
            >
              Analyze {images.length} Image{images.length > 1 ? "s" : ""} with AI + Context
            </Button>
            <Button variant="ghost" onClick={resetSelection}>
              Clear All
            </Button>
          </div>
          {!questionnaireComplete ? (
            <p className="mt-2 text-xs font-semibold text-warningOrange">
              Complete context form below to enable analysis.
            </p>
          ) : null}
          {awaitingFollowup ? (
            <p className="mt-2 text-xs font-semibold text-medicalBlue dark:text-blue-300">
              Step 1 complete. Submit follow-up answers below for final prediction.
            </p>
          ) : null}
        </Card>
      ) : null}

      {hasImages ? (
        <Card>
          <CancerQuestionnaire
            value={questionnaire}
            onChange={handleQuestionAnswer}
            assessment={questionnaireAssessment}
          />
        </Card>
      ) : null}

      {awaitingFollowup ? (
        <Card>
          <div className="space-y-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Follow-up Questions (Step 2 of 2)
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                These questions are generated from your image + context. Answer all to get final prediction.
              </p>
            </div>

            <div className="space-y-3">
              {followupItems.map((item, index) => (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {index + 1}. {item.question}
                  </p>
                  {item.key === "duration_days" ? (
                    <input
                      type="number"
                      min="0"
                      value={followupAnswers[item.key] || ""}
                      onChange={(event) => handleFollowupAnswer(item.key, event.target.value)}
                      className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-medicalBlue focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
                      placeholder="Enter number of days"
                    />
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {["Yes", "No", "Not sure"].map((option) => {
                        const active = followupAnswers[item.key] === option;
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => handleFollowupAnswer(item.key, option)}
                            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                              active
                                ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                                : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <Button
              onClick={submitFollowupForFinalPrediction}
              loading={isAnalyzing}
              disabled={!followupComplete}
            >
              Submit Follow-up Answers and Get Final Prediction
            </Button>
          </div>
        </Card>
      ) : null}

      {isAnalyzing ? (
        <>
          <UploadProgress value={uploadProgress} />
          <Loader subtitle="Running image analysis with symptom context." />
        </>
      ) : null}

      {error ? (
        <Card className="border border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-900/10">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
          {canUseDemo ? (
            <Button className="mt-3" variant="secondary" onClick={useDemoResult}>
              Continue with Demo Result
            </Button>
          ) : null}
        </Card>
      ) : null}

      {showCropper && sourceImageUrl ? (
        <ImageCropperModal
          image={sourceImageUrl}
          onCancel={() => {
            setShowCropper(false);
            setCropTargetId(null);
            setSourceImageUrl("");
          }}
          onComplete={(cropped) => {
            setImages((current) =>
              current.map((image) => {
                if (image.id !== cropTargetId) return image;
                if (image.previewUrl?.startsWith("blob:")) {
                  URL.revokeObjectURL(image.previewUrl);
                }
                return {
                  ...image,
                  file: cropped.file,
                  previewUrl: cropped.previewUrl,
                };
              })
            );
            if (cropTargetId) {
              setSelectedImageId(cropTargetId);
            }
            setShowCropper(false);
            setCropTargetId(null);
            setSourceImageUrl("");
          }}
        />
      ) : null}
    </motion.section>
  );
}

export default ScanPage;
