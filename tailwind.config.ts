import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        paper: {
          DEFAULT: "#FBF8F3",
          deep: "#F4EFE6",
          card: "#FFFFFF",
        },
        ink: {
          DEFAULT: "#1F1B16",
          soft: "#524B41",
        },
        primary: {
          DEFAULT: "#2F5D50",
          soft: "#F0F4F2",
          deep: "#23453C",
        },
        accent: "#E0A458",
        stage: {
          DEFAULT: "#0E1116",
          panel: "#161A21",
        },
      },
      fontFamily: {
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "SF Pro Text",
          "Inter",
          "Segoe UI",
          "system-ui",
          "sans-serif",
        ],
      },
      borderRadius: {
        "4xl": "1.75rem",
      },
      boxShadow: {
        soft: "0 1px 2px rgba(31,27,22,0.04), 0 8px 24px -12px rgba(31,27,22,0.12)",
        lift: "0 2px 4px rgba(31,27,22,0.05), 0 18px 40px -18px rgba(31,27,22,0.28)",
        cue: "0 24px 60px -24px rgba(0,0,0,0.55)",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-up": "fade-up 320ms cubic-bezier(0.2,0.8,0.2,1) both",
      },
    },
  },
  plugins: [],
};
export default config;
