import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

function Tooltip({ content, children }) {
  const [isVisible, setIsVisible] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
      onFocus={() => setIsVisible(true)}
      onBlur={() => setIsVisible(false)}
    >
      {children}
      <AnimatePresence>
        {isVisible ? (
          <motion.span
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 w-max max-w-52 -translate-x-1/2 rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow-lg"
            role="tooltip"
          >
            {content}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </span>
  );
}

export default Tooltip;
