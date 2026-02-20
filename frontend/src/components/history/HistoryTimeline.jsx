import { motion } from "framer-motion";
import RiskBadge from "../result/RiskBadge";

function HistoryTimeline({ scans = [] }) {
  if (!scans.length) {
    return (
      <div className="glass-card p-6 text-center text-sm text-slate-500 dark:text-slate-400">
        No scans found for selected filters.
      </div>
    );
  }

  return (
    <div className="relative space-y-4 before:absolute before:left-4 before:top-3 before:h-[calc(100%-12px)] before:w-px before:bg-slate-300 dark:before:bg-slate-700">
      {scans.map((scan, index) => (
        <motion.div
          key={scan.id}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="relative ml-10 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900"
        >
          <span className="absolute -left-[30px] top-4 h-3 w-3 rounded-full bg-medicalBlue" />
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {new Date(scan.createdAt).toLocaleString()}
              </p>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {scan.predictedClass}
              </h4>
            </div>
            <RiskBadge riskLevel={scan.riskLevel} />
          </div>
          <div className="mt-3 flex items-center gap-3">
            <img
              src={scan.image}
              alt="scanned lesion"
              className="h-16 w-16 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
            />
            <div className="space-y-1">
              <p className="text-xs text-slate-600 dark:text-slate-300">{scan.explanation}</p>
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {scan.images?.length || 1} image{(scan.images?.length || 1) > 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

export default HistoryTimeline;
