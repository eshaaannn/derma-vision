import {
  ArcElement,
  Chart as ChartJS,
  Legend,
  Tooltip as ChartTooltip,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";

ChartJS.register(ArcElement, ChartTooltip, Legend);

function ResultConfidenceChart({ confidence = 0 }) {
  const safeConfidence = Math.max(0, Math.min(100, Number(confidence) || 0));

  const data = {
    labels: ["Confidence", "Uncertainty"],
    datasets: [
      {
        data: [safeConfidence, 100 - safeConfidence],
        backgroundColor: ["#2563EB", "#E2E8F0"],
        borderWidth: 0,
      },
    ],
  };

  const options = {
    responsive: true,
    cutout: "75%",
    plugins: {
      legend: { display: false },
      tooltip: { enabled: true },
    },
  };

  return (
    <div className="relative mx-auto w-full max-w-[220px]">
      <Doughnut data={data} options={options} />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <p className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{safeConfidence}%</p>
      </div>
    </div>
  );
}

export default ResultConfidenceChart;
