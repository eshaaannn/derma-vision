function InputField({
  id,
  label,
  type = "text",
  placeholder,
  value,
  onChange,
  error,
  helperText,
  ...rest
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <input
        id={id}
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-help` : undefined}
        className={`w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-all focus:ring-2 ${
          error
            ? "border-red-300 focus:border-red-400 focus:ring-red-200"
            : "border-slate-200 focus:border-medicalBlue focus:ring-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-blue-900/40"
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
      {!error && helperText ? (
        <p id={`${id}-help`} className="text-xs text-slate-500 dark:text-slate-400">
          {helperText}
        </p>
      ) : null}
    </div>
  );
}

export default InputField;
