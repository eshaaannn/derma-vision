import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useTheme } from "../../context/ThemeContext";
import Button from "../ui/Button";
import BrandLogo from "../ui/BrandLogo";
import BackButton from "../ui/BackButton";

const navItems = [
  { label: "Dashboard", to: "/dashboard" },
  { label: "Scan", to: "/scan" },
  { label: "Results", to: "/result" },
  { label: "History", to: "/history" },
  { label: "Profile", to: "/profile" },
];

function AppLayout() {
  const { user, logout } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-softBg pb-10 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-card/95 backdrop-blur shadow-sm dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_8px_20px_-14px_rgba(8,43,61,0.8)]">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-center px-4 py-3 md:justify-between md:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-12 w-12" />
            <div>
              <p className="font-season text-[30px] font-bold leading-none text-slate-900 dark:text-slate-100">
                DermaVision
              </p>
              <p className="hidden text-xs text-slate-500 dark:text-slate-300 md:block">
                AI Skin Screening
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 rounded-xl border border-transparent px-1 py-1 md:flex dark:border-slate-800 dark:bg-slate-900/70">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-blue-100 text-medicalBlue shadow-sm dark:bg-medical-gradient dark:text-white"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-blue-100"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-card text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-100 dark:hover:border-blue-800 dark:hover:bg-slate-800"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2.3M12 19.2v2.3M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
            <Button variant="ghost" className="hidden md:inline-flex" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
        <div className="border-t border-slate-200 bg-card px-4 py-2 md:hidden dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <nav className="flex flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold ${
                      isActive
                        ? "bg-blue-100 text-medicalBlue dark:bg-medical-gradient dark:text-white"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-200"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-card text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-blue-100 dark:hover:border-blue-800 dark:hover:bg-slate-800"
              aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            >
              {isDark ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <circle cx="12" cy="12" r="4.2" />
                  <path d="M12 2.5v2.3M12 19.2v2.3M4.8 4.8l1.6 1.6M17.6 17.6l1.6 1.6M2.5 12h2.3M19.2 12h2.3M4.8 19.2l1.6-1.6M17.6 6.4l1.6-1.6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-6">
        <BackButton fallbackTo="/dashboard" className="mb-3" />
        <div className="mb-5 rounded-2xl bg-medical-gradient p-4 text-white shadow-soft">
          <h1 className="text-lg font-bold md:text-xl">Welcome back, {user?.fullName || "User"}</h1>
          <p className="text-sm text-white/90">
            Early detection saves lives. Continue your routine skin checks.
          </p>
        </div>
        <Outlet />
      </main>
    </div>
  );
}

export default AppLayout;
