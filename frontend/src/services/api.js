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

export default apiClient;
