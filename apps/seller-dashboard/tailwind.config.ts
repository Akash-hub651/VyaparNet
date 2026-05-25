import type { Config } from 'tailwindcss';

/**
 * VyaparNet Design Tokens — Tailwind Configuration
 *
 * Authority: VyaparNet_Product_UX_System_v1.md Section 29 (Design Tokens)
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
        // VyaparNet Design Token Colors
        // Authority: VyaparNet_Product_UX_System_v1.md Section 2.1
        primary: {
          DEFAULT: '#2563EB',
          dark: '#1D4ED8',
        },
        secondary: {
          DEFAULT: '#0D9488',
        },
        accent: {
          DEFAULT: '#F59E0B',
        },
        success: {
          DEFAULT: '#10B981',
        },
        warning: {
          DEFAULT: '#F59E0B',
        },
        error: {
          DEFAULT: '#EF4444',
        },
        surface: {
          DEFAULT: '#FFFFFF',
          page: '#F8FAFC',
        },
        border: {
          DEFAULT: '#E2E8F0',
        },
        'text-primary': '#1E293B',
        'text-secondary': '#64748B',
        'text-disabled': '#94A3B8',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'Arial', 'Helvetica', 'sans-serif'],
        heading: ['var(--font-manrope)', 'var(--font-inter)', 'sans-serif'],
      },
      fontSize: {
        // VyaparNet Typography Scale
        // Authority: VyaparNet_Product_UX_System_v1.md Section 2.2
        display: ['32px', { lineHeight: '1.22', fontWeight: '700' }],
        h1: ['24px', { lineHeight: '1.22', fontWeight: '700' }],
        h2: ['20px', { lineHeight: '1.22', fontWeight: '600' }],
        h3: ['16px', { lineHeight: '1.22', fontWeight: '600' }],
        body: ['14px', { lineHeight: '1.5', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '1.5', fontWeight: '400' }],
        micro: ['10px', { lineHeight: '1.5', fontWeight: '500' }],
      },
      spacing: {
        // VyaparNet Spacing Scale (base unit: 4px)
        // Authority: VyaparNet_Product_UX_System_v1.md Section 3.1
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px',
        '2xl': '48px',
        '3xl': '64px',
      },
      borderRadius: {
        sm: '4px',
        DEFAULT: '8px',
        lg: '12px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 3px rgba(0,0,0,0.05)',
        DEFAULT: '0 4px 6px rgba(0,0,0,0.1)',
      },
    },
  },
  plugins: [],
};

export default config;
