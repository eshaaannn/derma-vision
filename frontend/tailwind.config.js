/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        medicalBlue: "#2563EB",
        healthGreen: "#22C55E",
        warningOrange: "#F97316",
        softBg: "#F8FAFC",
        card: "#FFFFFF",
      },
      boxShadow: {
        soft: "0 10px 30px -12px rgba(37, 99, 235, 0.22)",
      },
      backgroundImage: {
        "medical-gradient":
          "linear-gradient(135deg, #2563EB 0%, #22C55E 50%, #14B8A6 100%)",
        "accent-gradient":
          "linear-gradient(135deg, #2563EB 0%, #F97316 100%)",
      },
    },
  },
  plugins: [],
};
