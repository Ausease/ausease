/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const colors = {
  light: {
    // Legacy aliases (kept for backward compatibility)
    text: '#182333',
    tint: '#F1744E',

    // Core surfaces
    background: '#F4F0E6',
    foreground: '#182333',
    ink: '#182333',
    paper: '#F4F0E6',
    white: '#FFFFFF',

    // Cards / elevated surfaces
    card: '#FFFDF7',
    cardForeground: '#182333',
    paperStrong: '#FFFDF7',

    // Primary action color (buttons, links, active states)
    primary: '#F1744E',
    primaryForeground: '#182333',
    coral: '#F1744E',
    coralSoft: '#FCE4E0',
    warningSoft: '#FFF0D7',
    warningText: '#A15D16',

    // Secondary / less-emphasis interactive surfaces
    secondary: '#E9E6DC',
    secondaryForeground: '#182333',
    sand: '#E9E6DC',

    // Muted / subdued elements (dividers, timestamps, placeholders)
    muted: '#EDE9DF',
    mutedForeground: '#65707F',
    slate: '#65707F',

    // Accent highlights (badges, selected items, focus rings)
    accent: '#DDF561',
    accentForeground: '#182333',
    lime: '#DDF561',
    limeSoft: '#F0F8C9',
    teal: '#3B8B75',
    ochre: '#D48835',

    // Destructive actions (delete, error states)
    destructive: '#C94545',
    destructiveForeground: '#ffffff',

    // Borders and input outlines
    border: '#D9D5CC',
    input: '#BDC4D1',
  },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
