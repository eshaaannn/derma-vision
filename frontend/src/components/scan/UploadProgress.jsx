import { motion } from "framer-motion";

function UploadProgress({ value }) {
  return (
    <div className="glass-card p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Uploading and analyzing</p>
        <span className="text-xs font-bold text-medicalBlue">{value}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800">
        <motion.div
          className="h-full rounded-full bg-medical-gradient"
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.35 }}
        />
      </div>
    </div>
  );
}

export default UploadProgress;
