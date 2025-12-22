/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
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
      fontSize: {
        'xs': ['0.625rem', { lineHeight: '1rem' }],      // 10px (was 12px)
        'sm': ['0.75rem', { lineHeight: '1.25rem' }],    // 12px (was 14px)
        'base': ['0.875rem', { lineHeight: '1.5rem' }],  // 14px (was 16px)
        'lg': ['1rem', { lineHeight: '1.75rem' }],       // 16px (was 18px)
        'xl': ['1.125rem', { lineHeight: '1.75rem' }],   // 18px (was 20px)
        '2xl': ['1.375rem', { lineHeight: '2rem' }],     // 22px (was 24px)
        '3xl': ['1.75rem', { lineHeight: '2.25rem' }],   // 28px (was 30px)
        '4xl': ['2rem', { lineHeight: '2.5rem' }],       // 32px (was 36px)
        '5xl': ['2.5rem', { lineHeight: '1' }],          // 40px (was 48px)
        '6xl': ['3rem', { lineHeight: '1' }],            // 48px (was 60px)
        '7xl': ['3.5rem', { lineHeight: '1' }],          // 56px (was 72px)
        '8xl': ['4rem', { lineHeight: '1' }],            // 64px (was 96px)
        '9xl': ['4.5rem', { lineHeight: '1' }],          // 72px (was 128px)
      },
    },
  },
  plugins: [],
};
