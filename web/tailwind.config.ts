import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx,css,mdx}'],
  theme: {
    extend: {
      fontFamily: {
        editorial: ['var(--font-editorial)', 'Georgia', 'serif'],
        sans: ['var(--font-sans)', 'PingFang SC', 'sans-serif'],
      },
      colors: {
        accent: '#c4b5fd',
      },
    },
  },
  plugins: [],
};
export default config;
