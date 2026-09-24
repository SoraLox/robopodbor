import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    container: { center: true, padding: '18px', screens: { '2xl': '1120px' } },
    extend: {
      // aria-invalid не входит в стандартный набор именованных aria-вариантов
      // Tailwind (checked/disabled/expanded/hidden/pressed/readonly/required/selected) —
      // добавляем явно для стилизации полей форм по состоянию валидации.
      aria: {
        invalid: 'invalid="true"',
      },
      fontFamily: {
        // Space Grotesk убран: в гарнитуре нет кириллицы
        heading: ['"Inter Variable"', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['"Inter Variable"', 'Inter', 'Helvetica', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        canvas: 'hsl(var(--canvas))',
        hairline: 'hsl(var(--hairline))',
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
          hover: 'hsl(var(--primary-hover))',
          bright: 'hsl(var(--primary-bright))',
        },
        'accent-tint': 'hsl(var(--accent-tint))',
        'meta-foreground': 'hsl(var(--meta-foreground))',
        muted: { DEFAULT: 'hsl(var(--muted))', foreground: 'hsl(var(--muted-foreground))' },
        accent: { DEFAULT: 'hsl(var(--accent))', foreground: 'hsl(var(--accent-foreground))' },
        secondary: { DEFAULT: 'hsl(var(--secondary))', foreground: 'hsl(var(--secondary-foreground))' },
        card: { DEFAULT: 'hsl(var(--card))', foreground: 'hsl(var(--card-foreground))' },
        popover: { DEFAULT: 'hsl(var(--popover))', foreground: 'hsl(var(--popover-foreground))' },
        destructive: { DEFAULT: 'hsl(var(--destructive))', foreground: 'hsl(var(--destructive-foreground))' },
        status: {
          operation: 'hsl(var(--status-operation))',
          'operation-tint': 'hsl(var(--status-operation-tint))',
          piloting: 'hsl(var(--status-piloting))',
          'piloting-tint': 'hsl(var(--status-piloting-tint))',
          rnd: 'hsl(var(--status-rnd))',
          'rnd-tint': 'hsl(var(--status-rnd-tint))',
          confirmed: 'hsl(var(--status-confirmed))',
          'confirmed-tint': 'hsl(var(--status-confirmed-tint))',
          danger: 'hsl(var(--status-danger))',
          'danger-tint': 'hsl(var(--status-danger-tint))',
        },
        chart: {
          1: 'hsl(var(--chart-1))',
          2: 'hsl(var(--chart-2))',
          3: 'hsl(var(--chart-3))',
        },
      },
      borderRadius: {
        xl: 'var(--radius)',
        lg: 'calc(var(--radius) - 6px)',
        md: 'calc(var(--radius) - 10px)',
        sm: 'calc(var(--radius) - 14px)',
        '2xl': 'calc(var(--radius) + 8px)',
        '3xl': 'calc(var(--radius) + 20px)',
      },
      /* max-w-site живёт в globals.css через --site-max — не дублировать здесь */
      letterSpacing: {
        display: '-0.03em',
        h1: '-0.025em',
        h2: '-0.012em',
        label: '0.14em',
      },
      /*
        Единая ролевая шкала шрифта — один семейный шрифт (Inter) на весь
        интерфейс, как у Stripe/Linear/Vercel: иерархию несёт не выбор
        гарнитуры, а связка размер+начертание+трекинг, зашитая в саму роль.
        Каждый класс (text-display…text-meta) уже содержит нужный вес —
        отдельно указывать font-bold/font-medium рядом с ним не нужно.
      */
      fontSize: {
        display: ['2.75rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '700' }],
        h1: ['1.75rem', { lineHeight: '1.15', letterSpacing: '-0.02em', fontWeight: '700' }],
        h2: ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.012em', fontWeight: '600' }],
        h3: ['1.125rem', { lineHeight: '1.3', letterSpacing: '-0.006em', fontWeight: '600' }],
        'body-lg': ['1rem', { lineHeight: '1.6', fontWeight: '400' }],
        body: ['0.9375rem', { lineHeight: '1.55', fontWeight: '400' }],
        control: ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        label: ['0.8125rem', { lineHeight: '1.3', fontWeight: '600' }],
        meta: ['0.75rem', { lineHeight: '1.4', fontWeight: '500' }],
        micro: ['0.6875rem', { lineHeight: '1.3', letterSpacing: '0.08em', fontWeight: '600' }],
      },
      boxShadow: {
        soft: '0 1px 2px hsl(240 3% 12% / 0.04), 0 12px 32px -12px hsl(240 3% 12% / 0.16)',
        lift: '0 8px 16px -8px hsl(240 3% 12% / 0.12), 0 24px 48px -20px hsl(240 3% 12% / 0.22)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animate],
};

export default config;
