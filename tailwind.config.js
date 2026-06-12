/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'Helvetica Neue',
          'Arial',
          'sans-serif',
        ],
      },
      colors: {
        brand: {
          50:  '#eff4ff',
          100: '#dbe6fe',
          200: '#bfd3fe',
          300: '#93b4fd',
          400: '#608cfa',
          500: '#3b66f6',
          600: '#2549eb',
          700: '#1d39d8',
          800: '#1e31af',
          900: '#1e2f8a',
        },
      },
      boxShadow: {
        // Softer, more diffuse shadows than Tailwind's defaults
        sm: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        DEFAULT: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 4px 12px -2px rgb(15 23 42 / 0.08)',
        md: '0 2px 4px -1px rgb(15 23 42 / 0.06), 0 8px 20px -4px rgb(15 23 42 / 0.10)',
        lg: '0 4px 8px -2px rgb(15 23 42 / 0.08), 0 16px 32px -8px rgb(15 23 42 / 0.14)',
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 6px 16px -6px rgb(15 23 42 / 0.10)',
        glow: '0 6px 20px -6px rgb(37 73 235 / 0.45)',
      },
      borderRadius: {
        xl: '0.875rem',
        '2xl': '1.125rem',
      },
    },
  },
  plugins: [],
}
