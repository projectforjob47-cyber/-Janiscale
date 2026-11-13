/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // SMART DC Modern Green & Warm Cream brand colors
        primary: {
          DEFAULT: '#12803C',
          dark: '#0B5E2B',
          light: '#39A85B',
          50: '#F0F9F3',
          100: '#D5EEDD',
          200: '#AEE0BD',
          500: '#12803C',
          600: '#0E6D32',
          700: '#0B5E2B',
          800: '#074720',
          900: '#042E14',
        },
        warm: {
          cream: '#F7F2EA',     // Warm Cream Background
          white: '#FFFDF9',     // Soft White Card
          beige: '#EFD9A7',     // Light Beige Accent
          border: '#E8E1D8',    // Warm Border
        },
        accent: {
          yellow: '#F2C230',    // Accent Yellow
          text: '#1F1F1F',      // Main Text
          subtext: '#6E6E6E',   // Secondary Text
        },
        // Status colors
        status: {
          waiting: '#F2C230',   // รอชั่ง - amber/yellow
          pass: '#12803C',      // ชั่งครบ - green
          fail: '#E03131',      // ผิดเกณฑ์ - red
          pending: '#7950F2',   // รอ OTM - purple
          missing: '#F76707',   // ส่งไม่ครบ - orange
        }
      },
      fontFamily: {
        thai: ['Sarabun', 'sans-serif'],
      },
      fontSize: {
        // Larger touch targets for warehouse use
        'input-lg': ['20px', '28px'],
      },
      boxShadow: {
        'xs': '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
      }
    },
  },
  plugins: [],
}
