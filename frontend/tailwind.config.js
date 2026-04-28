/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{html,ts}"],
  theme: {
    extend: {
      colors: {
        // Primary — ใช้ CSS variables เพื่อรองรับ dark/light mode
        'primary': {
          DEFAULT: 'var(--color-primary)',
          900: 'var(--color-primary-900)',
          700: 'var(--color-primary-700)',
          500: 'var(--color-primary-500)',
          300: 'var(--color-primary-300)',
          100: 'var(--color-primary-100)',
        },
        // Accent Gold
        'accent': {
          DEFAULT: 'var(--color-accent)',
          warm: 'var(--color-accent-warm)',
          light: 'var(--color-accent-light)',
        },
        // Financial
        'profit': 'var(--color-profit)',
        'loss': 'var(--color-loss)',
        'discount-color': 'var(--color-discount)',
        'budget': 'var(--color-budget)',
        // Surfaces
        'surface': 'var(--color-surface)',
        'section': 'var(--color-section)',
        'app-bg': 'var(--color-bg)',
      },
      borderRadius: {
        'sm': '6px',
        'md': '10px',
        'lg': '16px',
        'xl': '20px',
        'full': '999px',
      },
      boxShadow: {
        'card': 'var(--shadow-sm)',
        'card-hover': 'var(--shadow-md)',
        'dialog': 'var(--shadow-lg)',
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
