import type { BrandConfig } from './brand.ts';

/**
 * Social card of DrXRates: the one image used for link previews and for the GitHub social preview.
 * Edit the values below and run `npm run brand`; the layout itself is in brand.ts.
 * Paths are relative to the folder that holds `public/`.
 */
export default {
  name: 'DrXRates',
  // The wordmark as HTML. The families are the ones listed in `fonts`; an accent letter is a coloured span.
  wordmark: `<span style="font-family:Garamond;font-weight:600">Dr. <span style="color:#c9a45c">X</span> Rates</span>`,
  wordmarkSize: 130,
  // One short creative line, specific to this project.
  line: 'Every film, rated in ten parts.',
  background: '#0b0a09',
  // Accent: rules, diamonds, first glow and most lights. Secondary: second glow and some lights.
  primary: '#c9a45c',
  secondary: '#a3412f',
  // The icon tile shown on the card.
  icon: 'public/icon-512.png',
  bodyFont: 'Inter',
  fonts: [
    { family: 'Garamond', file: 'scripts/brand/fonts/eb-garamond-600-normal.woff', weight: 600 },
    { family: 'Inter', file: 'scripts/brand/fonts/inter-400-normal.woff', weight: 400 },
  ],
  output: 'public/og-image.jpg',
} satisfies BrandConfig;
