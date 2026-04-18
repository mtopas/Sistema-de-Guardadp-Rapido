/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        'app-bg':           'var(--bg)',
        'app-surface':      'var(--surface)',
        'app-sidebar':      'var(--sidebar)',
        'app-accent':       'var(--accent)',
        'app-accent-light': 'var(--accent-light)',
        'app-text':         'var(--text)',
        'app-subtext':      'var(--subtext)',
        'app-border':       'var(--border)',
      },
    },
  },
  plugins: [],
}
