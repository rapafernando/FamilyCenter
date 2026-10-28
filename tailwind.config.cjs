module.exports = {
  presets: [require('./tailwind.preset.cjs')],
  content: ['./src/**/*.{ts,tsx}'],
  // Touch screens report hover after a tap and leave it stuck. Only style :hover where a real pointer exists.
  future: { hoverOnlyWhenSupported: true },
};
