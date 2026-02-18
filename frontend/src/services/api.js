import axios from "axios";

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "http://localhost:8000",
  timeout: 25000,
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
