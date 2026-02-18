import { motion } from "framer-motion";

function Loader({ title = "Analyzing lesion image", subtitle = "Please wait..." }) {
  return (
    <div className="glass-card flex flex-col items-center gap-4 p-8 text-center">
      <motion.div
        className="h-14 w-14 rounded-full border-4 border-medicalBlue/20 border-t-medicalBlue"
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, ease: "linear", duration: 1 }}
      />
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
      </div>
    </div>
  );
}

export default Loader;
