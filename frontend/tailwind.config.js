/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // Primary
        'primary': {
          DEFAULT: '#16324F',
          900: '#16324F',
          700: '#1F4B73',
          500: '#2F6EA3',
          300: '#6FA3D4',
          100: '#DCEAF6',
        },
        // Accent Gold
        'accent': {
          DEFAULT: '#C8A96B',
          warm: '#B88A44',
          light: '#F4E9D7',
        },
        // Financial
        'profit': '#2E7D32',
        'loss': '#D32F2F',
        'discount-color': '#ED6C02',
        'budget': '#0288D1',
        // Surfaces
        'surface': '#FFFFFF',
        'section': '#FAFBFC',
        'app-bg': '#F6F8FB',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
        'full': '999px',
      },
      boxShadow: {
        'card': '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
        'card-hover': '0 4px 12px rgba(0,0,0,0.08)',
        'dialog': '0 8px 24px rgba(0,0,0,0.1)',
      },
      fontFamily: {
        'sans': ['Inter', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'page-title': ['28px', { lineHeight: '36px', fontWeight: '700' }],
        'section-title': ['22px', { lineHeight: '30px', fontWeight: '600' }],
        'card-title': ['18px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body': ['14px', { lineHeight: '22px', fontWeight: '400' }],
        'caption': ['12px', { lineHeight: '18px', fontWeight: '400' }],
        'kpi': ['32px', { lineHeight: '40px', fontWeight: '700' }],
        'table': ['13px', { lineHeight: '20px', fontWeight: '400' }],
      },
    },
  },
  plugins: [],
};
