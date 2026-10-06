/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bg: {
          app: 'rgb(var(--color-bg-app) / <alpha-value>)',
          panel: 'rgb(var(--color-bg-panel) / <alpha-value>)',
          elevated: 'rgb(var(--color-bg-elevated) / <alpha-value>)',
          sunken: 'rgb(var(--color-bg-sunken) / <alpha-value>)',
          chat: 'rgb(var(--color-bg-chat) / <alpha-value>)',
          hover: 'rgb(var(--color-bg-hover) / <alpha-value>)',
          active: 'rgb(var(--color-bg-active) / <alpha-value>)',
          overlay: 'rgb(var(--color-bg-overlay) / <alpha-value>)',
          bubbleOut: 'rgb(var(--color-bubble-out) / <alpha-value>)',
          bubbleIn: 'rgb(var(--color-bubble-in) / <alpha-value>)',
        },
        fg: {
          primary: 'rgb(var(--color-fg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--color-fg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--color-fg-tertiary) / <alpha-value>)',
          inverse: 'rgb(var(--color-fg-inverse) / <alpha-value>)',
          link: 'rgb(var(--color-fg-link) / <alpha-value>)',
          accent: 'rgb(var(--color-fg-accent) / <alpha-value>)',
          error: 'rgb(var(--color-fg-error) / <alpha-value>)',
          success: 'rgb(var(--color-fg-success) / <alpha-value>)',
          warning: 'rgb(var(--color-fg-warning) / <alpha-value>)',
          onAccent: 'rgb(var(--color-fg-on-accent) / <alpha-value>)',
          // The markup uses the kebab-case spelling; both resolve to the same token.
          'on-accent': 'rgb(var(--color-fg-on-accent) / <alpha-value>)',
        },
        border: {
          DEFAULT: 'rgb(var(--color-border) / <alpha-value>)',
          subtle: 'rgb(var(--color-border-subtle) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: 'var(--font-sans)',
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '0.875rem' }],
      },
      borderRadius: {
        bubble: 'var(--radius-bubble)',
        panel: 'var(--radius-panel)',
      },
      boxShadow: {
        panel: 'var(--shadow-panel)',
        dropdown: 'var(--shadow-dropdown)',
        card: 'var(--shadow-card)',
        accent: 'var(--shadow-accent)',
        bubble: 'var(--shadow-bubble)',
        float: 'var(--shadow-float)',
        ring: 'var(--shadow-ring)',
      },
      transitionTimingFunction: {
        spring: 'cubic-bezier(0.22, 1, 0.36, 1)',
        smooth: 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-down': 'slideDown 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
        'slide-in-right': 'slideInRight 0.2s ease-out',
        'scale-in': 'scaleIn 0.18s cubic-bezier(0.22, 1, 0.36, 1)',
        'message-in': 'messageIn 0.32s cubic-bezier(0.22, 1, 0.36, 1) both',
        'pop-in': 'popIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) both',
        'float-up': 'floatUp 0.4s cubic-bezier(0.22, 1, 0.36, 1) both',
        shimmer: 'shimmer 1.6s linear infinite',
        'pulse-ring': 'pulseRing 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'bounce-dot': 'bounceDot 1.4s ease-in-out infinite both',
        'wiggle': 'wiggle 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(12px) scale(0.98)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        slideDown: {
          '0%': { transform: 'translateY(-8px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        slideInRight: {
          '0%': { transform: 'translateX(8px)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        scaleIn: {
          '0%': { transform: 'scale(0.95)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        messageIn: {
          '0%': { transform: 'translateY(10px) scale(0.97)', opacity: '0' },
          '100%': { transform: 'translateY(0) scale(1)', opacity: '1' },
        },
        popIn: {
          '0%': { transform: 'scale(0.6)', opacity: '0' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        floatUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        pulseRing: {
          '0%': { transform: 'scale(1)', opacity: '0.6' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        bounceDot: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%': { transform: 'translateY(-5px)', opacity: '1' },
        },
        wiggle: {
          '0%, 100%': { transform: 'rotate(0deg)' },
          '25%': { transform: 'rotate(-6deg)' },
          '75%': { transform: 'rotate(6deg)' },
        },
      },
    },
  },
  plugins: [],
};
