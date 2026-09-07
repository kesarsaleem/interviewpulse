/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
  ],

  presets: [require('nativewind/preset')],

  theme: {
    extend: {
      colors: {

        // AI Brand Colors
        primary: {
          DEFAULT: '#8B5CF6',
          50: '#F5F3FF',
          100: '#EDE9FE',
          600: '#8B5CF6',
          700: '#7C3AED',
        },

        accent: {
          DEFAULT: '#3B82F6',
          50: '#EFF6FF',
          600: '#3B82F6',
        },


        // Dark Surfaces
        surface: {
          DEFAULT: '#151B2E',
          light: '#1E293B',
          dark: '#0F172A',
        },


        background: {
          DEFAULT: '#0B1020',
          dark: '#080B14',
        },


        // Status
        success: '#22C55E',
        warning: '#F59E0B',
        error: '#EF4444',


        // Text
        text: {
          primary: '#F8FAFC',
          secondary: '#CBD5E1',
          muted: '#94A3B8',
          inverse: '#0F172A',
        },


        // Borders
        border:

        {
          DEFAULT: '#26324A',
          dark: '#1E293B',
        },


        // AI Insight colors
        ai: {
          purple: '#A78BFA',
          blue: '#60A5FA',
          glow: '#C4B5FD',
        },
      },


      borderRadius: {
        card: '20px',
        control: '14px',
      },


      boxShadow: {
        card: '0 8px 30px rgba(0,0,0,0.25)',
        glow: '0 0 25px rgba(139,92,246,0.25)',
      },
    },
  },

  plugins: [],
};