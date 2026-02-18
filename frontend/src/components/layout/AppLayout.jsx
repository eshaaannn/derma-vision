import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
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
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-softBg pb-10 dark:bg-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/85">
        <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-3 md:px-6">
          <div className="flex items-center gap-3">
            <BrandLogo className="h-10 w-10" />
            <div>
              <p className="text-sm font-extrabold text-slate-900 dark:text-slate-100">
                Derma Vision
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                AI Skin Screening
              </p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 md:flex">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-2 text-sm font-semibold transition ${
                    isActive
                      ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="rounded-lg border border-slate-200 p-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              {isDark ? "Light" : "Dark"}
            </button>
            <button
              type="button"
              onClick={() => setMobileOpen((prev) => !prev)}
              className="rounded-lg border border-slate-200 p-2 text-xs font-semibold text-slate-600 md:hidden dark:border-slate-700 dark:text-slate-200"
            >
              Menu
            </button>
            <Button variant="ghost" className="hidden md:inline-flex" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
        {mobileOpen ? (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="border-t border-slate-200 bg-white px-4 py-3 md:hidden dark:border-slate-800 dark:bg-slate-950"
          >
            <div className="flex flex-wrap gap-2">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    `rounded-lg px-3 py-2 text-sm font-semibold ${
                      isActive
                        ? "bg-blue-100 text-medicalBlue dark:bg-blue-900/30 dark:text-blue-200"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              <Button variant="ghost" className="w-full" onClick={handleLogout}>
                Logout
              </Button>
            </div>
          </motion.div>
        ) : null}
      </header>

      <main className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-6">
        <BackButton fallbackTo="/dashboard" className="mb-3" />
        <div className="mb-5 rounded-2xl bg-gradient-to-r from-medicalBlue to-healthGreen p-4 text-white shadow-soft">
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
