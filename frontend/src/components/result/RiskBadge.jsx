const riskStyles = {
  Low: "bg-blue-50 text-blue-800 ring-blue-200 dark:bg-blue-900/35 dark:text-blue-100",
  Medium:
    "bg-blue-100 text-medicalBlue ring-blue-300 dark:bg-blue-900/45 dark:text-blue-100",
  High: "bg-red-100 text-red-700 ring-red-200 dark:bg-red-900/30 dark:text-red-200",
};

function RiskBadge({ riskLevel = "Low" }) {
  return (
    <span
      className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ring-1 ${
        riskStyles[riskLevel] || riskStyles.Low
      }`}
    >
      {riskLevel} Risk
    </span>
  );
}

export default RiskBadge;
