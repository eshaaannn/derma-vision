import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

function TipsAccordion({ tips = [] }) {
  const [openIndex, setOpenIndex] = useState(0);

  return (
    <div className="space-y-2">
      {tips.map((tip, index) => {
        const isOpen = openIndex === index;
        return (
          <div
            key={`${tip}-${index}`}
            className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
          >
            <button
              type="button"
              className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-slate-200"
              onClick={() => setOpenIndex(isOpen ? -1 : index)}
            >
              <span>Health Tip #{index + 1}</span>
              <span>{isOpen ? "-" : "+"}</span>
            </button>
            <AnimatePresence initial={false}>
              {isOpen ? (
                <motion.p
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden px-4 pb-3 text-sm text-slate-600 dark:text-slate-300"
                >
                  {tip}
                </motion.p>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

export default TipsAccordion;
