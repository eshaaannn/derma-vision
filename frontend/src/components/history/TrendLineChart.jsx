import {
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LineElement,
  LinearScale,
  PointElement,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Line } from "react-chartjs-2";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTooltip,
  Legend
);

function TrendLineChart({ scans = [] }) {
  const labels = scans.map((scan) =>
    new Date(scan.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })
  );
  const points = scans.map((scan) => scan.riskScore || 1);

  const data = {
    labels,
    datasets: [
      {
        label: "Risk Trend",
        data: points,
        borderColor: "#2563EB",
        backgroundColor: "rgba(37, 99, 235, 0.2)",
        tension: 0.35,
        fill: true,
      },
    ],
  };

  const options = {
    responsive: true,
    scales: {
      y: {
        min: 0,
        max: 3.5,
        ticks: {
          callback: (value) => {
            if (value === 1) return "Low";
            if (value === 2) return "Medium";
            if (value === 3) return "High";
            return "";
          },
        },
      },
    },
    plugins: { legend: { display: false } },
  };

  return scans.length ? (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <h3 className="mb-2 text-sm font-bold text-slate-700 dark:text-slate-200">Scan Trend Over Time</h3>
      <Line data={data} options={options} />
    </div>
  ) : null;
}

export default TrendLineChart;
