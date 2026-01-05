/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: '#00d9ff',
        'primary-hover': '#66e8ff',
        danger: '#ef4444',
        'danger-hover': '#f87171',
        'background-dark': '#0a0e27',
        'background-secondary': '#151b3d',
        'surface-dark': '#152a2e',
        'surface-darker': '#0f2124',
        'accent-blue': '#20454b',
        'accent-glow': 'rgba(0, 217, 255, 0.5)',
      },
      fontFamily: {
        display: ['Inter', 'sans-serif'],
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.375rem',
        lg: '0.5rem',
        xl: '0.75rem',
        '2xl': '1rem',
        full: '9999px',
      },
      boxShadow: {
        neon: '0 0 10px rgba(0, 217, 255, 0.3), 0 0 20px rgba(0, 217, 255, 0.1)',
        'neon-hover': '0 0 15px rgba(0, 217, 255, 0.6), 0 0 30px rgba(0, 217, 255, 0.2)',
        'neon-strong': '0 0 30px rgba(0, 217, 255, 0.6), 0 0 15px rgba(0, 217, 255, 0.4)',
      },
      animation: {
        shimmer: 'shimmer 1.5s infinite',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
    },
  },
  plugins: [],
};
