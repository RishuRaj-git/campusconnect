/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: { 50:'#eef2ff', 500:'#4f46e5', 600:'#4338ca', 900:'#1e1b4b' },
        accent: { 400:'#a3e635', 500:'#84cc16' }
      },
      fontFamily: { display: ['Space Grotesk','sans-serif'], body: ['Inter','sans-serif'] }
    }
  },
  plugins: []
};
