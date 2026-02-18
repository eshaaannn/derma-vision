const questions = [
  {
    key: "lesionDuration",
    label: "How long have you noticed this skin spot or lesion?",
    options: ["Less than 1 month", "1-6 months", "More than 6 months", "Not sure"],
  },
  {
    key: "recentChanges",
    label: "Have you noticed any recent changes in this spot?",
    options: ["Size increased", "Color changed", "Shape changed", "No change"],
  },
  {
    key: "lesionSymptoms",
    label: "Does the spot itch, bleed, or cause pain?",
    options: ["Yes", "No"],
  },
  {
    key: "irregularBorder",
    label: "Is the border of this spot irregular or uneven?",
    options: ["Yes", "No", "Not sure"],
  },
  {
    key: "colorPattern",
    label: "Is the color uniform or does it have multiple shades?",
    options: ["Uniform", "Multiple colors"],
  },
];

function CancerQuestionnaire({ value, onChange, assessment }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Cancer Risk Questionnaire
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Please answer these questions before AI analysis for better medical context.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((question) => (
          <div key={question.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{question.label}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {question.options.map((option) => {
                const active = value[question.key] === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onChange(question.key, option)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                      active
                        ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`}
                  >
                    {option}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {assessment ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-4 dark:border-blue-900/40 dark:bg-blue-900/10">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Questionnaire Inference:
            </p>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                assessment.level === "High"
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-200"
                  : assessment.level === "Moderate"
                    ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-200"
                    : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-200"
              }`}
            >
              {assessment.presence}
            </span>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Score: {assessment.score}
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-700 dark:text-slate-200">{assessment.message}</p>
          {assessment.reasons?.length ? (
            <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
              {assessment.reasons.slice(0, 4).map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default CancerQuestionnaire;
