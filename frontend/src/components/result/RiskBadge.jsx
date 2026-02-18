const riskStyles = {
  Low: "bg-green-100 text-green-700 ring-green-200 dark:bg-green-900/30 dark:text-green-200",
  Medium:
    "bg-orange-100 text-orange-700 ring-orange-200 dark:bg-orange-900/30 dark:text-orange-200",
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
