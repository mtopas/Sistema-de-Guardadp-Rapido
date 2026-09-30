/** Tokens reales viven en src/styles/base.css como CSS vars; Tailwind solo los aliasa. */
const v = (name) => `var(--${name})`

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Sora', 'Inter', 'system-ui', 'sans-serif'],
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        sidebar: v('sidebar'),
        panel: v('panel-bg'),
        elev: v('elev'),
        accent: { DEFAULT: v('accent'), light: v('accent-light'), deep: v('accent-deep') },
        txt: { DEFAULT: v('text'), 2: v('text-2'), sub: v('subtext'), mute: v('mute') },
        line: { DEFAULT: v('border'), strong: v('border-2') },
        success: v('success'),
        warning: v('warning'),
        danger: v('danger'),
        info: v('info'),
        income: v('income'),
        expense: v('expense'),
      },
      borderRadius: { xl2: '14px', xl3: '18px' },
      transitionTimingFunction: {
        swift: 'cubic-bezier(0.22, 1, 0.36, 1)',
        spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    },
  },
  plugins: [],
}
