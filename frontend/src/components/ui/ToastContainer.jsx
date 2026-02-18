import { AnimatePresence, motion } from "framer-motion";

const typeStyle = {
  success: "border-healthGreen/40 bg-green-50 text-green-800",
  error: "border-red-300 bg-red-50 text-red-800",
  warning: "border-warningOrange/40 bg-orange-50 text-orange-800",
  info: "border-medicalBlue/40 bg-blue-50 text-blue-800",
};

function ToastContainer({ toasts, onClose }) {
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[90] flex w-full max-w-sm flex-col gap-2">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -12, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -12, scale: 0.95 }}
            className={`pointer-events-auto rounded-xl border px-4 py-3 shadow-lg ${typeStyle[toast.type]}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-bold">{toast.title}</h4>
                <p className="mt-0.5 text-xs">{toast.message}</p>
              </div>
              <button
                type="button"
                onClick={() => onClose(toast.id)}
                className="rounded-md px-1 text-xs font-semibold opacity-75 hover:opacity-100"
              >
                Close
              </button>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ToastContainer;
