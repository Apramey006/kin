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
        paper: "#F5F5F7",
        ink: "#1D1D1F",
        primary: "#0066CC",
        stage: "#0E1116",
      },
    },
  },
  plugins: [],
};
export default config;
