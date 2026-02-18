import { useLocation, useNavigate } from "react-router-dom";

function BackButton({ fallbackTo = "/dashboard", className = "" }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = () => {
    if (window.history.length > 1 && location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate(fallbackTo, { replace: true });
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 ${className}`}
      aria-label="Go back"
    >
      <span aria-hidden="true">{"<"}</span>
      Back
    </button>
  );
}

export default BackButton;
