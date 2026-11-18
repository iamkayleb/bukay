/** @type {import('tailwindcss').Config} */
module.exports = {
  // The design system's tokens, exposed as ordinary utilities: bg-surface,
  // text-ink, text-muted, border-default, rounded-card, text-ds-sm. Synced from
  // iamkayleb/Workflows; do not fork it, override a token in an app stylesheet
  // loaded after tokens.css instead.
  presets: [require("./design-system/tailwind-preset.js")],
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {},
  },
  plugins: [],
};
