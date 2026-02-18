import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import Card from "../components/ui/Card";
import TrendLineChart from "../components/history/TrendLineChart";
import HistoryTimeline from "../components/history/HistoryTimeline";
import { getScanHistory } from "../utils/storage";
import Skeleton from "../components/ui/Skeleton";

function filterByDate(scans, dateFilter) {
  if (dateFilter === "all") return scans;
  const days = Number(dateFilter);
  const threshold = Date.now() - days * 24 * 60 * 60 * 1000;
  return scans.filter((scan) => new Date(scan.createdAt).getTime() >= threshold);
}

function HistoryPage() {
  const [loading, setLoading] = useState(true);
  const [riskFilter, setRiskFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [search, setSearch] = useState("");

  const scans = useMemo(() => getScanHistory(), []);

  const filteredScans = useMemo(() => {
    let next = filterByDate(scans, dateFilter);
    if (riskFilter !== "all") {
      next = next.filter((scan) => scan.riskLevel === riskFilter);
    }
    if (search.trim()) {
      const lower = search.toLowerCase();
      next = next.filter(
        (scan) =>
          scan.predictedClass.toLowerCase().includes(lower) ||
          scan.explanation.toLowerCase().includes(lower)
      );
    }
    return next;
  }, [dateFilter, riskFilter, scans, search]);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 700);
    return () => clearTimeout(timer);
  }, []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-5"
    >
      <Card>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Search</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search class or explanation"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-900/40"
            />
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Risk level</span>
            <select
              value={riskFilter}
              onChange={(event) => setRiskFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-900/40"
            >
              <option value="all">All</option>
              <option value="Low">Low</option>
              <option value="Medium">Medium</option>
              <option value="High">High</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Date range</span>
            <select
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-blue-900/40"
            >
              <option value="all">All time</option>
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
            </select>
          </label>

          <div className="rounded-xl bg-blue-50 px-3 py-2 dark:bg-blue-900/20">
            <p className="text-xs font-semibold text-medicalBlue dark:text-blue-200">Filtered scans</p>
            <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              {filteredScans.length}
            </p>
          </div>
        </div>
      </Card>

      {loading ? <Skeleton className="h-64 w-full" /> : <TrendLineChart scans={[...filteredScans].reverse()} />}

      <Card>
        <h3 className="mb-4 text-base font-bold text-slate-900 dark:text-slate-100">Scan Timeline</h3>
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ) : (
          <HistoryTimeline scans={filteredScans} />
        )}
      </Card>
    </motion.section>
  );
}

export default HistoryPage;
