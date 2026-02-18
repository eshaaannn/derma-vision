# Derma Vision MVP

## Run Backend (PowerShell)

```powershell
cd backendapi
venv\Scripts\python.exe -m pip install -r requirements.txt
venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

Backend health check: `http://localhost:8000/health`

## Run Frontend (new terminal)

```powershell
cd frontend
npm install
npm run dev
```

Frontend: `http://localhost:5173`

## Current MVP Wiring

- Frontend auth uses Supabase (`frontend/.env`).
- Frontend prediction calls backend `POST /predict` with `X-API-Key`.
- Backend model adapter reads `ai-training/inference.py`.
- If ML model/deps are unavailable, backend still returns deterministic fallback prediction for demo continuity.
