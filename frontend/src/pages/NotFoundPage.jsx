import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import BackButton from "../components/ui/BackButton";

function NotFoundPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-softBg p-4 dark:bg-slate-950">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card max-w-md p-6 text-center"
      >
        <div className="mb-3 text-left">
          <BackButton fallbackTo="/dashboard" />
        </div>
        <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">Page Not Found</h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
          The requested page does not exist or has been moved.
        </p>
        <Link
          to="/dashboard"
          className="mt-4 inline-flex rounded-xl bg-medical-gradient px-4 py-2 text-sm font-semibold text-white"
        >
          Return to Dashboard
        </Link>
      </motion.div>
    </div>
  );
}

export default NotFoundPage;
