import { motion } from "framer-motion";

function IntroSplash() {
  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-white"
      aria-label="DermaVision intro"
    >
      <div className="flex flex-col items-center">
        <motion.img
          src="/derma-vision-logo.svg"
          alt="DermaVision logo"
          initial={{ opacity: 0, scale: 0.88, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.45 }}
          className="h-24 w-24 object-contain"
        />

        <motion.h1
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 1.15 }}
          className="mt-3 font-season text-[48px] font-bold leading-none tracking-tight text-[#1E1B4B] sm:text-[56px]"
        >
          DermaVision
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: "easeOut", delay: 1.8 }}
          className="mt-2 max-w-xl px-6 text-center text-sm font-medium text-[#334155] sm:text-base"
        >
          AI-based probability screening. Not a medical diagnosis.
        </motion.p>
      </div>
    </motion.div>
  );
}

export default IntroSplash;
