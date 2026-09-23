/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        passflow: {
          ink: 'rgb(var(--passflow-ink) / <alpha-value>)',
          muted: 'rgb(var(--passflow-muted) / <alpha-value>)',
          faint: 'rgb(var(--passflow-faint) / <alpha-value>)',
          border: 'rgb(var(--passflow-border) / <alpha-value>)',
          soft: 'rgb(var(--passflow-soft) / <alpha-value>)',
          video: 'rgb(var(--passflow-video) / <alpha-value>)',
          accent: 'rgb(var(--passflow-accent) / <alpha-value>)',
          'accent-hover': 'rgb(var(--passflow-accent-hover) / <alpha-value>)',
          success: 'rgb(var(--passflow-success) / <alpha-value>)',
          warning: 'rgb(var(--passflow-warning) / <alpha-value>)',
          danger: 'rgb(var(--passflow-danger) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
}
