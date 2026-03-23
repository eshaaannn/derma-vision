# Derma Vision Frontend

Production-ready React frontend for AI-based skin cancer detection using smartphone images.

## Tech Stack

- React.js (JavaScript)
- Tailwind CSS
- React Router DOM
- Axios
- Framer Motion
- Chart.js + react-chartjs-2

## Setup

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env` and set backend + Supabase values:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_API_KEY=hackathon-demo-key
VITE_SUPABASE_URL=https://naxucoudkdrflzxdcsiu.supabase.co
VITE_SUPABASE_ANON_KEY=your_anon_key
```

## Vercel Deployment

Before deploying this frontend to Vercel:

1. Set the Vercel project root directory to `derma-vision/frontend`.
2. Add these Production environment variables in Vercel:
   `VITE_API_BASE_URL`
   `VITE_API_KEY`
   `VITE_SUPABASE_URL`
   `VITE_SUPABASE_ANON_KEY`
   `VITE_MAX_IMAGE_COUNT`
3. Point `VITE_API_BASE_URL` to your deployed backend over HTTPS, not `localhost`.
4. Update the backend `CORS_ORIGINS` to include your Vercel domain, for example:

```env
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173,https://your-project.vercel.app
```

If you use Vercel preview deployments or frequently changing `*.vercel.app` URLs, also set the backend `CORS_ORIGIN_REGEX`, for example:

```env
CORS_ORIGIN_REGEX=^https://your-project(-[a-z0-9]+)?\.vercel\.app$
```

5. Add the Vercel site URL and any custom domain to Supabase Auth redirect settings if you use email confirmation, magic links, or OAuth.
6. Keep the Vercel SPA rewrite in `vercel.json` so direct refreshes on routes like `/dashboard` or `/scan` do not return 404.

Important:

- `VITE_*` variables are exposed to the browser. `VITE_API_KEY` is not a secret once deployed.
- If the backend stays on plain HTTP while the frontend is on HTTPS, browser requests will be blocked as mixed content.

## API

- `POST /predict` (multipart form-data with `image` field)

## Folder Structure

```text
src/
  App.js
  main.jsx
  index.css
  components/
    layout/
    ui/
    scan/
    result/
    history/
  context/
    AuthContext.jsx
    ThemeContext.jsx
    ToastContext.jsx
  pages/
    LoginPage.jsx
    SignupPage.jsx
    DashboardPage.jsx
    ScanPage.jsx
    ResultPage.jsx
    HistoryPage.jsx
    ProfilePage.jsx
    NotFoundPage.jsx
  routes/
    ProtectedRoute.jsx
  services/
    api.js
  utils/
    cropImage.js
    id.js
    prediction.js
    storage.js
```
