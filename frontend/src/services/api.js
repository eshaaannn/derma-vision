import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const apiKey = import.meta.env.VITE_API_KEY;
const isProd = import.meta.env.PROD;

if (!apiKey && isProd) {
  throw new Error("Missing VITE_API_KEY. Refusing to start in production without API authentication.");
}
if (!apiKey && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_KEY is not set. Requests will be sent without X-API-Key.");
}

function normalizeApiError(error) {
  const backendError = error?.response?.data?.error;
  const backendMessage = backendError?.message;
  const backendCode = backendError?.code;

  if (backendMessage) {
    const message = backendCode ? `${backendCode}: ${backendMessage}` : backendMessage;
    const wrapped = new Error(message);
    wrapped.status = error?.response?.status;
    wrapped.code = backendCode;
    return wrapped;
  }

  if (error?.code === "ECONNABORTED") {
    return new Error("Request timed out. Please retry with a stable connection.");
  }

  return error instanceof Error ? error : new Error("Request failed.");
}

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 25000,
  headers: apiKey ? { "X-API-Key": apiKey } : undefined,
});

export async function predictLesion(imageFile, onUploadProgress) {
  const formData = new FormData();
  formData.append("image", imageFile);

  try {
    const response = await apiClient.post("/predict", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export async function predictLesionEnhanced(imageFiles, context, followupAnswers, onUploadProgress) {
  const formData = new FormData();
  imageFiles.forEach((file) => {
    formData.append("images", file);
  });

  if (context && Object.keys(context).length) {
    formData.append("context", JSON.stringify(context));
  }
  if (followupAnswers && Object.keys(followupAnswers).length) {
    formData.append("followup_answers", JSON.stringify(followupAnswers));
  }

  try {
    const response = await apiClient.post("/predict/enhanced", formData, {
      headers: { "Content-Type": "multipart/form-data" },
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export default apiClient;
