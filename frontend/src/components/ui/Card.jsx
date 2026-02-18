import { motion } from "framer-motion";

function Card({ children, className = "", delay = 0 }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay }}
      className={`glass-card p-5 ${className}`}
    >
      {children}
    </motion.article>
  );
}

export default Card;
