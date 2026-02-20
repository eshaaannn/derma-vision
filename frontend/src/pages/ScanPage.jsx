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
  isQuestionnaireComplete,
} from "../utils/questionnaire";

const MAX_IMAGE_COUNT = Number(import.meta.env.VITE_MAX_IMAGE_COUNT || 4);
const REQUIRED_INPUT_MESSAGE =
  "Please upload an image and provide clinical context before proceeding.";
const INPUT_ERROR_CODES = new Set([
  "TOO_MANY_IMAGES",
  "INVALID_IMAGE",
  "UNSUPPORTED_IMAGE",
  "IMAGE_TOO_LARGE",
  "INVALID_CONTEXT",
  "MISSING_IMAGE",
]);

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeFollowupItems(normalizedResponse) {
  const source = Array.isArray(normalizedResponse?.followupItems)
    ? normalizedResponse.followupItems
    : [];

  const deduped = [];
  const seen = new Set();

  source.forEach((item) => {
    const key = item?.key ? String(item.key).trim() : "";
    const question = item?.question ? String(item.question).trim() : "";
    if (!key || !question || seen.has(key)) return;
    seen.add(key);
    deduped.push({ key, question });
  });

  return deduped.slice(0, 6);
}

function buildPerImageResults(imageCount, response, normalized) {
  const perImageScores = Array.isArray(response?.details?.individual_scores)
    ? response.details.individual_scores
    : [];

  return Array.from({ length: imageCount }).map((_, index) => {
    const rawScore = Number(perImageScores[index]);
    const safeScore = Number.isFinite(rawScore) ? clamp(rawScore, 0, 1) : null;

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
  const [questionnaire, setQuestionnaire] = useState({ ...QUESTIONNAIRE_DEFAULTS });
  const [followupItems, setFollowupItems] = useState([]);
  const [followupAnswers, setFollowupAnswers] = useState({});
  const [pendingContextPayload, setPendingContextPayload] = useState(null);

  const imagesRef = useRef([]);

  const hasImages = useMemo(() => images.length > 0, [images.length]);
  const questionnaireComplete = useMemo(
    () => isQuestionnaireComplete(questionnaire),
    [questionnaire]
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
        if (item.key === "duration_days") {
          return raw !== "" && Number.isFinite(Number(raw)) && Number(raw) >= 0;
        }
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
  };

  const handleIncomingFiles = (files) => {
    const validFiles = files.filter((file) => file.type.startsWith("image/"));
    if (!validFiles.length) return;

    const remainingSlots = Math.max(0, MAX_IMAGE_COUNT - images.length);
    if (remainingSlots <= 0) {
      const maxMessage = `Maximum ${MAX_IMAGE_COUNT} images allowed. Remove one to add a new image.`;
      setError(maxMessage);
      showToast({
        type: "warning",
        title: "Image Limit Reached",
        message: maxMessage,
      });
      return;
    }

    const acceptedFiles = validFiles.slice(0, remainingSlots);

    setError("");
    clearFollowupState();

    const nextImages = acceptedFiles.map((file) => ({
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

    if (acceptedFiles.length < validFiles.length) {
      showToast({
        type: "warning",
        title: "Extra Images Skipped",
        message: `Only ${MAX_IMAGE_COUNT} images are supported per analysis.`,
      });
    }
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
    setQuestionnaire({ ...QUESTIONNAIRE_DEFAULTS });
    clearFollowupState();
  };

  const finalizeResult = async (
    normalized,
    perImageResults,
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
      probabilities: normalized.probabilities,
      riskScore: getRiskScore(normalized.riskLevel),
      contextText: questionnaire.contextText?.trim() || "",
      contextPayload,
      followupQuestions:
        normalized.followupQuestions?.length
          ? normalized.followupQuestions
          : followupItems.map((item) => item.question),
      followupItems: normalized.followupItems?.length ? normalized.followupItems : followupItems,
      followupAnswers: followupAnswerPayload,
      backendStatus: backendResponse?.status || "success",
      topLabel: backendResponse?.top_label || normalized.predictedClass,
      backendDetails: normalized.backendDetails || backendResponse?.details || null,
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

  const startFollowupStep = (items, contextPayload) => {
    setFollowupItems(items);
    setFollowupAnswers(Object.fromEntries(items.map((item) => [item.key, ""])));
    setPendingContextPayload(contextPayload);
    setUploadProgress(100);
    showToast({
      type: "warning",
      title: "Follow-up Required",
      message: "Answer the relevant follow-up questions to generate final prediction.",
    });
  };

  const analyzeImages = async () => {
    const contextPayload = buildEnhancedContext(questionnaire);

    if (!hasImages || !contextPayload.context_text) {
      setError(REQUIRED_INPUT_MESSAGE);
      showToast({
        type: "warning",
        title: "Missing Required Input",
        message: REQUIRED_INPUT_MESSAGE,
      });
      return;
    }

    if (images.length > MAX_IMAGE_COUNT) {
      setError(`Maximum ${MAX_IMAGE_COUNT} images are allowed.`);
      return;
    }

    if (awaitingFollowup) {
      setError("Please answer follow-up questions to get final prediction.");
      return;
    }

    setIsAnalyzing(true);
    setError("");
    setUploadProgress(0);

    try {
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

      const normalized = normalizePredictionResponse(response);
      const followupFromApi = normalizeFollowupItems(normalized);

      if (response?.status && response.status !== "success") {
        if (followupFromApi.length) {
          startFollowupStep(followupFromApi, contextPayload);
          return;
        }

        const fallbackMessage =
          response?.message || "Analysis could not complete. Please retake clear images and try again.";
        setError(fallbackMessage);
        return;
      }

      if (followupFromApi.length) {
        startFollowupStep(followupFromApi, contextPayload);
        return;
      }

      const perImageResults = buildPerImageResults(images.length, response, normalized);

      setUploadProgress(100);
      showToast({
        type: "success",
        title: "Analysis Complete",
        message: `Final prediction generated from ${images.length} image(s) + clinical context.`,
      });

      await finalizeResult(normalized, perImageResults, contextPayload, response, null);
    } catch (apiError) {
      const inputError = Boolean(apiError?.code && INPUT_ERROR_CODES.has(apiError.code));
      const message = apiError?.message || "Could not reach prediction API. Please retry.";
      setError(message);
      showToast({
        type: inputError ? "warning" : "error",
        title: "Prediction Failed",
        message,
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
      const perImageResults = buildPerImageResults(images.length, response, normalized);

      setUploadProgress(100);
      showToast({
        type: "success",
        title: "Final Prediction Ready",
        message: "Final score updated using follow-up answers.",
      });

      await finalizeResult(normalized, perImageResults, contextPayload, response, {
        ...followupAnswers,
      });
      clearFollowupState();
    } catch (apiError) {
      setError(apiError?.message || "Could not process follow-up answers right now. Please retry.");
      showToast({
        type: "error",
        title: "Final Prediction Failed",
        message: apiError?.message || "API error while processing follow-up answers.",
      });
    } finally {
      setIsAnalyzing(false);
    }
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
          <DropzoneUpload
            onFilesSelect={handleIncomingFiles}
            maxImages={MAX_IMAGE_COUNT}
            currentCount={images.length}
          />
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
            <div className="mx-auto w-full max-w-[22rem]">
              <img
                src={selectedImage.previewUrl}
                alt="Selected lesion preview"
                className="aspect-square w-full rounded-xl border border-slate-200 object-cover dark:border-slate-700"
              />
              {images.length === 1 ? (
                <div className="mt-3 flex gap-2">
                  <Button
                    variant="ghost"
                    className="w-full px-2 py-1.5 text-xs"
                    onClick={() => openCropperForImage(selectedImage.id)}
                  >
                    Crop
                  </Button>
                  <Button
                    variant="danger"
                    className="w-full px-2 py-1.5 text-xs"
                    onClick={() => removeImage(selectedImage.id)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}

          {images.length > 1 ? (
            <div className="mt-4 grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              onClick={analyzeImages}
              loading={isAnalyzing}
              disabled={!hasImages || !questionnaireComplete || awaitingFollowup}
            >
              Analyze {images.length} Image{images.length > 1 ? "s" : ""} with AI + Context
            </Button>
            <Button variant="ghost" onClick={resetSelection}>
              Clear All
            </Button>
          </div>

          {!questionnaireComplete ? (
            <p className="mt-2 text-xs font-semibold text-warningOrange">{REQUIRED_INPUT_MESSAGE}</p>
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
          <CancerQuestionnaire value={questionnaire} onChange={handleQuestionAnswer} />
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
                These questions are generated from your image pattern and submitted clinical context.
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
          <Loader subtitle="Running image analysis with clinical context." />
        </>
      ) : null}

      {error ? (
        <Card className="border border-red-200 bg-red-50/70 dark:border-red-900/40 dark:bg-red-900/10">
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">{error}</p>
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
