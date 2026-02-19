import axios from "axios";

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const apiKey = import.meta.env.VITE_API_KEY || "hackathon-demo-key";

const apiClient = axios.create({
  baseURL: apiBaseUrl,
  timeout: 25000,
  headers: apiKey ? { "X-API-Key": apiKey } : undefined,
});

export async function predictLesion(imageFile, onUploadProgress) {
  const formData = new FormData();
  formData.append("image", imageFile);

  const response = await apiClient.post("/predict", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });

  return response.data;
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

  const response = await apiClient.post("/predict/enhanced", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress,
  });

  return response.data;
}

export default apiClient;
