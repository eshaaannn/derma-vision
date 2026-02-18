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
import { predictLesion } from "../services/api";
import { getRiskScore, normalizePredictionResponse } from "../utils/prediction";
import { useToast } from "../context/ToastContext";
import { createId } from "../utils/id";
import {
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

  const handleIncomingFiles = (files) => {
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!validFiles.length) return;

    setError("");
    setCanUseDemo(false);

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
  };

  const finalizeResult = async (normalized, perImageResults, finalQuestionnaireAssessment) => {
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
      questionnaireAssessment: finalQuestionnaireAssessment
        ? { ...finalQuestionnaireAssessment, answeredAt: new Date().toISOString() }
        : null,
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

  const analyzeImages = async () => {
    if (!images.length) {
      setError("Please upload at least one image before analysis.");
      return;
    }
    if (!questionnaireComplete) {
      setError("Please complete the cancer questionnaire before AI analysis.");
      showToast({
        type: "warning",
        title: "Questionnaire Incomplete",
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
      const predictions = [];
      const totalImages = images.length;

      for (let index = 0; index < totalImages; index += 1) {
        const file = images[index].file;
        const data = await predictLesion(file, (event) => {
          if (!event.total) return;
          const filePercent = event.loaded / event.total;
          const combinedPercent = ((index + filePercent) / totalImages) * 95;
          setUploadProgress(Math.round(Math.min(combinedPercent, 95)));
        });

        predictions.push(normalizePredictionResponse(data));
        setUploadProgress(Math.round(((index + 1) / totalImages) * 95));
      }

      const merged = aggregatePredictions(predictions);
      const fused = fusePredictionWithQuestionnaire(merged, finalQuestionnaireAssessment);
      setUploadProgress(100);
      showToast({
        type: "success",
        title: "Analysis Complete",
        message: `Final prediction generated from ${images.length} images + questionnaire.`,
      });
      await finalizeResult(fused, predictions, finalQuestionnaireAssessment);
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

  const useDemoResult = async () => {
    const finalQuestionnaireAssessment = evaluateCancerQuestionnaire(questionnaire);
    const demoPredictions = images.map(() => generateDemoPrediction());
    const merged = aggregatePredictions(demoPredictions);
    const fused = fusePredictionWithQuestionnaire(merged, finalQuestionnaireAssessment);
    showToast({
      type: "warning",
      title: "Demo Mode",
      message: "Showing simulated result because API was unavailable.",
    });
    await finalizeResult(fused, demoPredictions, finalQuestionnaireAssessment);
  };

  const handleQuestionAnswer = (key, value) => {
    setQuestionnaire((current) => ({ ...current, [key]: value }));
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
            <Button onClick={analyzeImages} loading={isAnalyzing} disabled={!questionnaireComplete}>
              Analyze {images.length} Image{images.length > 1 ? "s" : ""} with AI
            </Button>
            <Button variant="ghost" onClick={resetSelection}>
              Clear All
            </Button>
          </div>
          {!questionnaireComplete ? (
            <p className="mt-2 text-xs font-semibold text-warningOrange">
              Complete questionnaire below to enable analysis.
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

      {isAnalyzing ? (
        <>
          <UploadProgress value={uploadProgress} />
          <Loader subtitle="Running cancer risk model and generating medical explanation." />
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
