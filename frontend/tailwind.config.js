/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        medicalBlue: "#1E1B4B",
        healthGreen: "#14B8A6",
        warningOrange: "#38BDF8",
        softBg: "#F1F5F9",
        card: "#FFFFFF",
        slate: {
          50: "#F1F5F9",
          100: "#E2E8F0",
          200: "#CBD5E1",
          300: "#94A3B8",
          400: "#64748B",
          500: "#475569",
          600: "#334155",
          700: "#1E293B",
          800: "#172033",
          900: "#121A2B",
          950: "#0F172A",
        },
        blue: {
          50: "#E9F8FE",
          100: "#D5F0FD",
          200: "#B0E3FB",
          300: "#7AD0F9",
          400: "#38BDF8",
          500: "#24A6E3",
          600: "#148CC6",
          700: "#0F6E9C",
          800: "#0D5577",
          900: "#0C3F59",
          950: "#082B3D",
        },
      },
      boxShadow: {
        soft: "0 12px 30px -14px rgba(30, 27, 75, 0.24)",
      },
      fontFamily: {
        season: ['"Season"', '"Times New Roman"', "Georgia", "serif"],
      },
      backgroundImage: {
        "medical-gradient":
          "linear-gradient(135deg, #1E1B4B 0%, #14B8A6 55%, #38BDF8 100%)",
        "accent-gradient":
          "linear-gradient(135deg, #1E1B4B 0%, #38BDF8 100%)",
      },
    },
  },
  plugins: [],
};
