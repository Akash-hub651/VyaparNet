import type { Config } from 'tailwindcss';

/**
 * VyaparNet Seller Dashboard — Tailwind Design Token Configuration
 *
 * Authority:
 *   seller_dashboard_uxui_system.md §3.2 (Color Token Set)
 *   seller_dashboard_uxui_system.md §4.2 (Typography Scale)
 *   seller_dashboard_uxui_system.md §5   (Spacing)
 *   seller_dashboard_screen_system.md §G (Global Standards)
 *
 * RULE: All token names here MUST match CSS variable names in globals.css.
 * Never reference hex values directly in components — always use token classes.
 */
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        /* ── BRAND ─────────────────────────────────────────── */
        brand: {
          50:  'var(--color-brand-50)',
          100: 'var(--color-brand-100)',
          500: 'var(--color-brand-500)',
          600: 'var(--color-brand-600)',
          700: 'var(--color-brand-700)',
        },

        /* ── SURFACE ───────────────────────────────────────── */
        surface: {
          app:      'var(--color-surface-app)',
          card:     'var(--color-surface-card)',
          sidebar:  'var(--color-surface-sidebar)',
          header:   'var(--color-surface-header)',
          hover:    'var(--color-surface-hover)',
          selected: 'var(--color-surface-selected)',
        },

        /* ── TEXT ──────────────────────────────────────────── */
        'text-primary':   'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'text-muted':     'var(--color-text-muted)',
        'text-on-dark':   'var(--color-text-on-dark)',
        'text-on-brand':  'var(--color-text-on-brand)',

        /* ── BORDER ────────────────────────────────────────── */
        border: {
          DEFAULT: 'var(--color-border-default)',
          default: 'var(--color-border-default)',
          strong:  'var(--color-border-strong)',
          focus:   'var(--color-border-focus)',
        },

        /* ── SEMANTIC — SUCCESS ─────────────────────────────── */
        success: {
          50:  'var(--color-success-50)',
          100: 'var(--color-success-100)',
          500: 'var(--color-success-500)',
          700: 'var(--color-success-700)',
        },

        /* ── SEMANTIC — WARNING ─────────────────────────────── */
        warning: {
          50:  'var(--color-warning-50)',
          100: 'var(--color-warning-100)',
          500: 'var(--color-warning-500)',
          700: 'var(--color-warning-700)',
        },

        /* ── SEMANTIC — ERROR ───────────────────────────────── */
        error: {
          50:  'var(--color-error-50)',
          100: 'var(--color-error-100)',
          500: 'var(--color-error-500)',
          600: 'var(--color-error-600)',
          700: 'var(--color-error-700)',
        },

        /* ── SEMANTIC — INFO ────────────────────────────────── */
        info: {
          50:  'var(--color-info-50)',
          100: 'var(--color-info-100)',
          500: 'var(--color-info-500)',
          700: 'var(--color-info-700)',
        },

        /* ── NEUTRAL ────────────────────────────────────────── */
        neutral: {
          50:  'var(--color-neutral-50)',
          100: 'var(--color-neutral-100)',
          200: 'var(--color-neutral-200)',
          300: 'var(--color-neutral-300)',
          400: 'var(--color-neutral-400)',
          700: 'var(--color-neutral-700)',
        },

        /* ── ACCENT (RFQ / Special) ─────────────────────────── */
        accent: {
          100: 'var(--color-accent-100)',
          600: 'var(--color-accent-600)',
        },
      },

      /* ── FONT FAMILY ───────────────────────────────────────── */
      fontFamily: {
        sans:    ['var(--font-sans)', 'Arial', 'Helvetica', 'sans-serif'],
        heading: ['var(--font-sans)', 'Arial', 'Helvetica', 'sans-serif'],
        mono:    ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'monospace'],
      },

      /* ── FONT SIZE ─────────────────────────────────────────── */
      /* Authority: seller_dashboard_uxui_system.md §4.2          */
      fontSize: {
        '2xs': ['0.625rem', { lineHeight: '1.5' }],   /* 10px */
        xs:    ['0.750rem', { lineHeight: '1.5' }],   /* 12px */
        sm:    ['0.875rem', { lineHeight: '1.5' }],   /* 14px */
        base:  ['1.000rem', { lineHeight: '1.5' }],   /* 16px */
        lg:    ['1.125rem', { lineHeight: '1.4' }],   /* 18px */
        xl:    ['1.250rem', { lineHeight: '1.4' }],   /* 20px */
        '2xl': ['1.500rem', { lineHeight: '1.3' }],   /* 24px */
        '3xl': ['1.875rem', { lineHeight: '1.2' }],   /* 30px */
        '4xl': ['2.250rem', { lineHeight: '1.2' }],   /* 36px */
      },

      /* ── BORDER RADIUS ─────────────────────────────────────── */
      /* Authority: screen_system §G.8 (rounded-md = 6px on buttons) */
      borderRadius: {
        sm:   'var(--radius-sm)',   /* 4px */
        md:   'var(--radius-md)',   /* 6px */
        DEFAULT: 'var(--radius-lg)', /* 8px */
        lg:   'var(--radius-lg)',   /* 8px */
        xl:   'var(--radius-xl)',   /* 12px */
        '2xl':'var(--radius-2xl)',  /* 16px */
        full: 'var(--radius-full)', /* 9999px */
      },

      /* ── BOX SHADOW ────────────────────────────────────────── */
      boxShadow: {
        1: 'var(--shadow-1)',
        2: 'var(--shadow-2)',
        3: 'var(--shadow-3)',
      },

      /* ── SPACING ───────────────────────────────────────────── */
      /* Matches app shell dimensions from §G.1                   */
      spacing: {
        '13': '3.25rem',  /* 52px — table row height              */
        '14': '3.5rem',   /* 56px — sidebar logo + mobile header  */
        '16': '4rem',     /* 64px — desktop header + bottom nav   */
        '56': '14rem',    /* 224px — sidebar expanded width       */
        '14-px': '56px',  /* sidebar collapsed width              */
      },

      /* ── HEIGHT / WIDTH UTILITIES ──────────────────────────── */
      height: {
        'screen-minus-header': 'calc(100vh - 64px)',
      },

      /* ── MAX WIDTH ─────────────────────────────────────────── */
      maxWidth: {
        'page': '1440px',   /* max content width per §G.1          */
        'modal-sm': '420px',
        'modal-md': '560px',
        'modal-lg': '720px',
      },

      /* ── Z-INDEX ───────────────────────────────────────────── */
      /* Authority: screen_system §G.14.4                         */
      zIndex: {
        sidebar:    '30',
        header:     '40',
        'bottom-nav':'40',
        drawer:     '50',
        modal:      '60',
        toast:      '70',
      },

      /* ── ANIMATION ─────────────────────────────────────────── */
      keyframes: {
        'skeleton-shimmer': {
          from: { backgroundPosition: '-200% 0' },
          to:   { backgroundPosition:  '200% 0' },
        },
        'toast-in': {
          from: { transform: 'translateX(100%)', opacity: '0' },
          to:   { transform: 'translateX(0)',    opacity: '1' },
        },
        'modal-in': {
          from: { opacity: '0', transform: 'scale(0.95)' },
          to:   { opacity: '1', transform: 'scale(1)'    },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to:   { transform: 'translateY(0)'    },
        },
        'badge-spring': {
          '0%':   { transform: 'scale(1)'   },
          '40%':  { transform: 'scale(1.3)' },
          '70%':  { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)'   },
        },
        spin: {
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        'skeleton': 'skeleton-shimmer 1.5s infinite',
        'toast-in': 'toast-in 200ms ease-out forwards',
        'modal-in': 'modal-in 150ms ease-out forwards',
        'sheet-up': 'sheet-up 300ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'badge-spring': 'badge-spring 200ms ease forwards',
        'spin-fast': 'spin 700ms linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
