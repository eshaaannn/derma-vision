const questions = [
  {
    key: "ageBand",
    label: "Which age group are you in?",
    options: ["<18", "18-39", "40-64", "65+"],
  },
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
    key: "itching",
    label: "Is there persistent itching in this area?",
    options: ["Yes", "No"],
  },
  {
    key: "bleeding",
    label: "Has this lesion bled, crusted, or oozed recently?",
    options: ["Yes", "No"],
  },
  {
    key: "pain",
    label: "Is the area painful or tender?",
    options: ["Yes", "No"],
  },
  {
    key: "scaling",
    label: "Do you see flaky, dry, or scaly skin on this lesion?",
    options: ["Yes", "No"],
  },
  {
    key: "ringShape",
    label: "Does it look ring-shaped with clearer center?",
    options: ["Yes", "No", "Not sure"],
  },
  {
    key: "spreading",
    label: "Has this lesion spread to nearby skin?",
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
  {
    key: "primaryConcern",
    label: "Which concern best matches what you see?",
    options: ["Cancer-like mole", "Fungal patch", "Bacterial lesion", "Rash/allergy", "Unsure"],
  },
  {
    key: "contextText",
    label: "Add extra context in your own words.",
    type: "textarea",
    placeholder:
      "Example: started after hiking, worsens with sweating, family member had melanoma, used antifungal cream for 1 week.",
  },
];

function CancerQuestionnaire({ value, onChange, assessment }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Image & Symptom Context
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Answer these while uploading and add text context so AI can combine image + history details.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((question) => (
          <div key={question.key} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{question.label}</p>
            {question.type === "textarea" ? (
              <textarea
                value={value[question.key] || ""}
                onChange={(event) => onChange(question.key, event.target.value)}
                rows={4}
                placeholder={question.placeholder}
                className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-medicalBlue focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
              />
            ) : (
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
            )}
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
