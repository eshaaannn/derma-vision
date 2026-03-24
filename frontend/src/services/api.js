import axios from "axios";

const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const apiKey = import.meta.env.VITE_API_KEY;
const isProd = import.meta.env.PROD;
const vercelProxyBaseUrl = "/api";

function normalizeBaseUrl(value) {
  if (!value) return "";
  return value === "/" ? value : value.replace(/\/+$/, "");
}

function shouldUseVercelProxy() {
  if (!isProd || typeof window === "undefined") return false;
  return /\.vercel\.app$/i.test(window.location.hostname);
}

const apiBaseUrl = shouldUseVercelProxy()
  ? vercelProxyBaseUrl
  : rawApiBaseUrl
    ? normalizeBaseUrl(rawApiBaseUrl)
    : import.meta.env.DEV
      ? "http://localhost:8000"
      : vercelProxyBaseUrl;
const isLocalApi = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(apiBaseUrl);

if (!apiBaseUrl && isProd) {
  throw new Error("Missing VITE_API_BASE_URL. Refusing to start in production without a backend URL.");
}
if (isProd && isLocalApi) {
  throw new Error("VITE_API_BASE_URL points to localhost. Set it to your deployed backend URL before shipping.");
}
if (shouldUseVercelProxy() && rawApiBaseUrl && normalizeBaseUrl(rawApiBaseUrl) !== vercelProxyBaseUrl) {
  // eslint-disable-next-line no-console
  console.warn("Using the Vercel /api proxy in production to avoid cross-origin upload failures.");
}
if (!rawApiBaseUrl && import.meta.env.DEV) {
  // eslint-disable-next-line no-console
  console.warn("VITE_API_BASE_URL is not set. Falling back to http://localhost:8000 for local development.");
}

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

  if (error?.message === "Network Error") {
    return new Error(
      `Could not upload to ${apiBaseUrl}. Check that the deployed backend URL is correct and retry.`
    );
  }

  return error instanceof Error ? error : new Error("Request failed.");
}

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 25000,
  headers: apiKey ? { "X-API-Key": apiKey } : undefined,
});

function buildScanParams(userId) {
  if (!userId) return undefined;
  return {
    user_id: userId,
    patient_ref: userId,
  };
}

export async function predictLesion(imageFile, userId, onUploadProgress) {
  const formData = new FormData();
  formData.append("image", imageFile);

  try {
    const response = await apiClient.post("/predict", formData, {
      params: buildScanParams(userId),
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export async function predictLesionEnhanced(
  imageFiles,
  context,
  followupAnswers,
  userId,
  onUploadProgress
) {
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
      params: buildScanParams(userId),
      onUploadProgress,
    });
    return response.data;
  } catch (error) {
    throw normalizeApiError(error);
  }
}

export default apiClient;
