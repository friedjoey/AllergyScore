import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#1c2621",
        moss: "#315c45",
        fern: "#4d8a62",
        mint: "#d9f4df",
        pollen: "#f5c94f",
        coral: "#df6a55",
        skywash: "#e7f2f6"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(27, 43, 34, 0.12)"
      }
    }
  },
  plugins: []
};

export default config;
