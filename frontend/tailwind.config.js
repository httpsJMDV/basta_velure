/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red:       '#C0001A',
          'red-dark':'#8B0013',
          'red-light':'#E8002A',
          black:     '#0D0D0D',
          'gray-dark':'#1A1A1A',
          'gray-mid': '#2E2E2E',
          'gray-soft':'#F5F5F5',
          white:     '#FFFFFF',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
      },
    },
  },
  plugins: [],
};
