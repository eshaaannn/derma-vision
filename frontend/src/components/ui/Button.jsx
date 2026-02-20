import { motion } from "framer-motion";

const variantStyles = {
  primary: "bg-medical-gradient text-white shadow-soft hover:shadow-lg",
  secondary:
    "bg-gradient-to-r from-healthGreen to-blue-400 text-white shadow-soft hover:shadow-lg",
  ghost:
    "border border-slate-200 bg-card text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  danger:
    "bg-gradient-to-r from-red-500 to-rose-600 text-white shadow-soft hover:shadow-lg",
};

function Button({
  children,
  type = "button",
  variant = "primary",
  className = "",
  loading = false,
  disabled = false,
  ...rest
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12 }}
      type={type}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-all duration-300 ${variantStyles[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-t-transparent" />
          Loading...
        </>
      ) : (
        children
      )}
    </motion.button>
  );
}

export default Button;
