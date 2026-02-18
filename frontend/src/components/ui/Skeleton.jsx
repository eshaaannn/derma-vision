function Skeleton({ className = "" }) {
  return (
    <div
      className={`animate-pulse rounded-xl bg-gradient-to-r from-slate-200 via-slate-100 to-slate-200 dark:from-slate-800 dark:via-slate-700 dark:to-slate-800 ${className}`}
    />
  );
}

export default Skeleton;
