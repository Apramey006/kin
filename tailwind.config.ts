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
        paper: "#FBF8F3",
        ink: "#1F1B16",
        primary: "#2F5D50",
        stage: "#0E1116",
      },
    },
  },
  plugins: [],
};
export default config;
