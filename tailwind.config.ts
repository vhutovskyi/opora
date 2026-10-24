import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        opora: {
          brown: "#5E4838", // For main text, burger, cart
          white: "#F8F8F8", // For the hero background
          softBeige: "#EFEAE4",  // For the drawer background
        }
      },
      fontFamily: {
        sans: ['var(--font-rubik)', 'sans-serif'],
      }
    },
  },
  plugins: [typography],
};
export default config;