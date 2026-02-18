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

Copy `.env.example` to `.env` and set backend URL:

```env
VITE_API_BASE_URL=http://localhost:8000
```

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
