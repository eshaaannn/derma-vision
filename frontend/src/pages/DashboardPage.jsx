import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import Button from "../components/ui/Button";
import Skeleton from "../components/ui/Skeleton";
import { deleteScan, getScanHistory } from "../utils/storage";
import { useToast } from "../context/ToastContext";

function DashboardPage() {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(true);
  const [scans, setScans] = useState(() => getScanHistory());

  const stats = useMemo(() => {
    const total = scans.length;
    const highRisk = scans.filter((scan) => scan.riskLevel === "High").length;
    const mediumRisk = scans.filter((scan) => scan.riskLevel === "Medium").length;
    const lowRisk = scans.filter((scan) => scan.riskLevel === "Low").length;
    return { total, highRisk, mediumRisk, lowRisk };
  }, [scans]);

  const recent = scans.slice(0, 3);

  const openScanResult = (scan) => {
    navigate("/result", { state: { result: scan } });
  };

  const handleDeleteScan = (scanId) => {
    const confirmed = window.confirm("Delete this previous detection record?");
    if (!confirmed) return;

    setScans(() => deleteScan(scanId));
    showToast({
      type: "success",
      title: "Detection Deleted",
      message: "Previous detection record was removed.",
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 750);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="text-xl font-extrabold text-slate-900 dark:text-slate-100">
            Ready for your next skin scan?
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Capture a lesion image using your camera or upload from your device gallery.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => navigate("/scan")} className="px-6 py-3 text-base">
              Start New Scan
            </Button>
            <Button variant="ghost" onClick={() => navigate("/history")}>
              View Full History
            </Button>
          </div>
        </Card>

        <Card>
          <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">Screening Scope</h3>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
            DermaVision provides AI-based probability screening from lesion images and context.
            Final clinical decisions require licensed medical evaluation.
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, idx) => (
              <Skeleton key={idx} className="h-24 w-full rounded-2xl" />
            ))
          : [
              { label: "Total Scans", value: stats.total, color: "text-medicalBlue" },
              { label: "Low Risk", value: stats.lowRisk, color: "text-healthGreen" },
              { label: "Medium Risk", value: stats.mediumRisk, color: "text-warningOrange" },
              { label: "High Risk", value: stats.highRisk, color: "text-red-500" },
            ].map((item, index) => (
              <Card key={item.label} delay={index * 0.05}>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {item.label}
                </p>
                <p className={`mt-2 text-3xl font-extrabold ${item.color}`}>{item.value}</p>
              </Card>
            ))}
      </div>

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">Recent Activity</h3>
          <Button variant="ghost" onClick={() => navigate("/history")}>
            See all
          </Button>
        </div>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : !recent.length ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            No scans yet. Start your first scan from the Scan page.
          </p>
        ) : (
          <div className="space-y-3">
            {recent.map((scan) => (
              <div
                key={scan.id}
                role="button"
                tabIndex={0}
                onClick={() => openScanResult(scan)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openScanResult(scan);
                  }
                }}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-200 p-3 transition hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-700 dark:hover:border-blue-700 dark:hover:bg-blue-900/10"
              >
                {scan.image ? (
                  <img
                    src={scan.image}
                    alt="Recent scan"
                    className="h-12 w-12 rounded-lg object-cover ring-1 ring-slate-200 dark:ring-slate-700"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-semibold text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
                    No Img
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {scan.predictedClass}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(scan.createdAt).toLocaleString()}
                  </p>
                </div>
                <p className="text-sm font-bold text-medicalBlue">{scan.confidence}%</p>
                <Button
                  variant="danger"
                  className="px-2 py-1 text-xs"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDeleteScan(scan.id);
                  }}
                >
                  Delete
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.section>
  );
}

export default DashboardPage;
