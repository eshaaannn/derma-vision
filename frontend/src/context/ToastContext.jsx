import { createContext, useContext, useMemo, useState } from "react";
import ToastContainer from "../components/ui/ToastContainer";
import { createId } from "../utils/id";

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = (id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  };

  const showToast = ({ title, message, type = "info" }) => {
    const id = createId("toast");
    const nextToast = { id, title, message, type };
    setToasts((current) => [nextToast, ...current].slice(0, 4));

    setTimeout(() => {
      removeToast(id);
    }, 4200);
  };

  const value = useMemo(
    () => ({
      toasts,
      showToast,
      removeToast,
    }),
    [toasts]
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onClose={removeToast} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside ToastProvider");
  }
  return context;
}
