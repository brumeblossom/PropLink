import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
      letterSpacing: {
        tight: "-0.02em",
      },
      colors: {
        border: "hsl(var(--border) / <alpha-value>)",
        input: "hsl(var(--input) / <alpha-value>)",
        ring: "hsl(var(--ring) / <alpha-value>)",
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "hsl(var(--primary) / <alpha-value>)",
          foreground: "hsl(var(--primary-foreground) / <alpha-value>)",
          tint: "hsl(var(--primary-tint))",
        },
        "primary-tint": "hsl(var(--primary-tint))",
        gold: {
          DEFAULT: "hsl(var(--gold) / <alpha-value>)",
          foreground: "hsl(var(--gold-foreground) / <alpha-value>)",
        },
        emphasis: "hsl(var(--emphasis) / <alpha-value>)",
        secondary: {
          DEFAULT: "hsl(var(--secondary) / <alpha-value>)",
          foreground: "hsl(var(--secondary-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive) / <alpha-value>)",
          foreground: "hsl(var(--destructive-foreground) / <alpha-value>)",
          tint: "hsl(var(--destructive-tint))",
        },
        "destructive-tint": "hsl(var(--destructive-tint))",
        success: {
          DEFAULT: "hsl(var(--success) / <alpha-value>)",
          tint: "hsl(var(--success-tint))",
        },
        "success-tint": "hsl(var(--success-tint))",
        warning: {
          DEFAULT: "hsl(var(--warning) / <alpha-value>)",
          tint: "hsl(var(--warning-tint))",
        },
        "warning-tint": "hsl(var(--warning-tint))",
        muted: {
          DEFAULT: "hsl(var(--muted) / <alpha-value>)",
          foreground: "hsl(var(--muted-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "hsl(var(--accent) / <alpha-value>)",
          foreground: "hsl(var(--accent-foreground) / <alpha-value>)",
        },
        popover: {
          DEFAULT: "hsl(var(--popover) / <alpha-value>)",
          foreground: "hsl(var(--popover-foreground) / <alpha-value>)",
        },
        card: {
          DEFAULT: "hsl(var(--card) / <alpha-value>)",
          foreground: "hsl(var(--card-foreground) / <alpha-value>)",
        },
        sidebar: "hsl(var(--sidebar) / <alpha-value>)",
        subtle: {
          DEFAULT: "hsl(var(--subtle-foreground) / <alpha-value>)",
          foreground: "hsl(var(--subtle-foreground) / <alpha-value>)",
        },
        "subtle-foreground": "hsl(var(--subtle-foreground) / <alpha-value>)",
        "kpi-navy": "hsl(var(--kpi-navy) / <alpha-value>)",
        "kpi-navy-tint": "hsl(var(--kpi-navy-tint))",
        "kpi-gold": "hsl(var(--kpi-gold) / <alpha-value>)",
        "kpi-gold-tint": "hsl(var(--kpi-gold-tint))",
        "kpi-sage": "hsl(var(--kpi-sage) / <alpha-value>)",
        "kpi-sage-tint": "hsl(var(--kpi-sage-tint))",
        "kpi-clay": "hsl(var(--kpi-clay) / <alpha-value>)",
        "kpi-clay-tint": "hsl(var(--kpi-clay-tint))",
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
        xl: "12px",
      },
    },
  },
  plugins: [],
};

export default config;
