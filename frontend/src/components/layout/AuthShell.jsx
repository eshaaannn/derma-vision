import { motion } from "framer-motion";
import BrandLogo from "../ui/BrandLogo";
import BackButton from "../ui/BackButton";

function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-softBg px-4 py-10 dark:bg-slate-950">
      <div className="pointer-events-none absolute -left-10 -top-12 h-56 w-56 rounded-full bg-blue-200/70 blur-3xl dark:bg-blue-900/30" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-60 w-60 rounded-full bg-emerald-200/70 blur-3xl dark:bg-emerald-900/30" />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass-card relative z-10 w-full max-w-md p-7"
      >
        <BackButton fallbackTo="/" className="mb-3" />
        <div className="mb-6 space-y-1 text-center">
          <div className="mb-2 flex justify-center">
            <BrandLogo className="h-14 w-14" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">{title}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
        </div>
        {children}
        {footer ? <div className="mt-5 text-center text-sm">{footer}</div> : null}
      </motion.div>
    </div>
  );
}

export default AuthShell;
