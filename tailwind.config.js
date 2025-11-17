/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/panels/**/*.hbs",
  ],
  theme: {
    screens: {
      'xs': '360px',
      // => @media (min-width: 480px) { ... }

      'sm': '640px',
      // => @media (min-width: 640px) { ... }

      'md': '768px',
      // => @media (min-width: 768px) { ... }

      'lg': '1024px',
      // => @media (min-width: 1024px) { ... }

      'xl': '1280px',
      // => @media (min-width: 1280px) { ... }

      '2xl': '1536px',
      // => @media (min-width: 1536px) { ... }
    },
    extend: {
      colors: {
        primary: {
          50: '#eef2fe',
          100: '#dce5fd',
          200: '#b9cbfb',
          300: '#96b1f9',
          400: '#7397f7',
          500: '#507df5',
          600: '#2847E2',
          700: '#1e3bc4',
          800: '#192e9d',
          900: '#142275'
        },
        methode: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75'
        }
      },
    },
  },
  plugins: [],
}
