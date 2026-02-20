function CancerQuestionnaire({ value, onChange }) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
          Clinical Context
        </h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Provide clinical context in your own words. This text is required before analysis.
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Describe lesion history, symptoms, and relevant factors.
        </p>
        <textarea
          value={value.contextText || ""}
          onChange={(event) => onChange("contextText", event.target.value)}
          rows={6}
          placeholder="Example: It started 2 months ago on left forearm, slowly enlarging, occasional itching, no bleeding, worsens with sweating, tried antifungal cream for 10 days."
          className="mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-medicalBlue focus:ring-2 focus:ring-blue-100 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200"
        />
      </div>
    </div>
  );
}

export default CancerQuestionnaire;
