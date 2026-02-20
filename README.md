# Derma Vision

AI-assisted skin lesion screening app with:
- image upload
- text + structured context capture
- condition-aware follow-up questions
- final risk prediction using image + context + follow-up answers

This is a screening tool, not a diagnosis.

## Repository Structure

```text
derma-vision/
  backendapi/    FastAPI service, prediction logic, Supabase persistence
  frontend/      React + Vite application
  ai-training/   Model training/inference scripts
```

## Current Prediction Flow (Implemented)

1. User uploads image(s).
2. User provides context (structured answers + free text).
3. Backend runs initial analysis (`POST /predict/enhanced`).
4. Backend returns up to 6 relevant follow-up questions based on detected pattern + context.
5. User answers follow-up questions.
6. Frontend submits follow-up answers to `POST /predict/enhanced`.
7. Backend returns final risk prediction.

## Prerequisites

- Python 3.10+
- Node.js 18+ (or newer LTS)
- npm

## Backend Setup (PowerShell)

```powershell
cd backendapi
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Health check:
- `http://localhost:8000/health`

API docs:
- `http://localhost:8000/docs`

## Frontend Setup (new terminal)

```powershell
cd frontend
npm install
npm run dev
```

Frontend:
- `http://localhost:5173`

## Environment Configuration

### Backend (`backendapi/.env`)

Copy from `backendapi/.env.example` and set values:

```env
API_KEY=hackathon-demo-key
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_TABLE=scan_results
ENABLE_SCAN_HISTORY=true
```

### Frontend (`frontend/.env`)

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=hackathon-demo-key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Main API Endpoints

- `GET /health`
- `POST /predict` (single image, basic flow)
- `POST /predict/enhanced` (multi-image + context + follow-up answers)
- `GET /scans`

### `POST /predict/enhanced` request fields

Multipart form-data:
- `images` (one or more image files)
- `context` (JSON object as string)
- `followup_answers` (JSON object as string, optional on first pass)

### Example context payload

```json
{
  "age": 52,
  "duration_days": 30,
  "itching": true,
  "bleeding": false,
  "rapid_growth": true,
  "primary_concern": "cancer",
  "context_text": "Started 1 month ago, became darker and slightly raised."
}
```

## Tech Stack

- Backend: FastAPI, Pydantic, Pillow, Supabase Python client
- Frontend: React, Vite, Axios, Framer Motion, Tailwind, Supabase JS
- Model Integration: `ai-training/inference.py` via backend adapter

## Notes

- Frontend auth is Supabase-based.
- Backend model adapter is configured via:
  - `MODEL_MODULE`
  - `MODEL_CALLABLE`
- If model/dependencies are unavailable, backend uses fallback inference for continuity.
