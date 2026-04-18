import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        editorial: ['Fraunces', 'Georgia', 'serif'],
        sans: ['"Inter Tight"', 'PingFang SC', 'sans-serif'],
      },
      colors: {
        accent: '#c4b5fd',
      },
    },
  },
  plugins: [],
};
export default config;
