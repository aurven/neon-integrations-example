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
          50: '#E6F3F7',
          100: '#CCE7EF',
          200: '#99CFE0',
          300: '#689DAD',
          400: '#1A7F9E',
          500: '#00526B',
          600: '#003F52',
          700: '#00232E',
          800: '#001820',
          900: '#000D12'
        }
      },
    },
  },
  plugins: [],
}
