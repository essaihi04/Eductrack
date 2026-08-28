/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        // Les polices emoji couleur devancent les polices de texte, qui
        // afficheraient ☺ ou ❤ en noir et blanc (voir index.css).
        sans: ['Nunito Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
        display: ['Nunito Sans', 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', 'IBM Plex Sans Arabic', 'system-ui', 'sans-serif'],
      },
      colors: {
        brand: {
          navy: '#173A59',
          coral: '#E66F51',
          gold: '#E8B447',
          teal: '#2A9D8F',
          cream: '#FFF7E9',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: 0 },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: 0 },
        },
        rise: {
          from: { opacity: 0, transform: 'translateY(10px)' },
          to: { opacity: 1, transform: 'none' },
        },
        'draw-check': {
          from: { 'stroke-dashoffset': 24 },
          to: { 'stroke-dashoffset': 0 },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        rise: 'rise 0.45s cubic-bezier(0.2, 0.8, 0.3, 1) both',
        'draw-check': 'draw-check 0.5s ease-out forwards',
      },
    },
  },
  plugins: [],
}
