import type { Config } from "tailwindcss";
export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: { extend: { fontFamily: { cairo: ["var(--font-cairo)", "sans-serif"] } } },
  plugins: [],
} satisfies Config;
