/** Two pi, used all over the drawing code. */
export const TAU = Math.PI * 2;

/**
 * Tunable gameplay and presentation constants.
 * Balance values live here so tuning never touches the logic layer.
 */
export const CONFIG = Object.freeze({
  /** Number of dirt patches spawned at the start of a round. */
  dirtCount: 26,
  /** Dirt patch radius range, in CSS pixels. */
  dirtRadiusMin: 8,
  dirtRadiusMax: 17,
  /** Upper bound on a single frame's deltaTime, in seconds (tab-switch guard). */
  maxFrameSeconds: 0.05,
  /** Passive temptation gained per second while the round runs. */
  passiveTemptationPerSecond: 1.1,
  /** Seconds of tool use charged for a single tap, so a tap is never free. */
  tapImpulseSeconds: 0.12,
  /** How far from Shiki freshly shed hair can land, in CSS pixels. */
  shedSpreadRadius: 190,
  /** Seconds a shed patch keeps its "fresh" highlight. */
  freshHairSeconds: 1.4,
});

/** Layout metrics, in CSS pixels. */
export const LAYOUT = Object.freeze({
  topBarHeight: 84,
  dockHeight: 72,
  dockMaxWidth: 440,
  dockBottomGap: 16,
  dockSideMargin: 16,
});

/**
 * Stitch design palette: cozy creams, warm browns and coral accents.
 */
export const PALETTE = Object.freeze({
  background: '#fdf9f4',
  surfaceBright: '#fdf9f4',
  surfaceContainerLow: '#f7f3ee',
  surfaceContainer: '#f1ede8',
  surfaceVariant: '#e6e2dd',
  surfaceDim: '#ddd9d5',
  onSurface: '#1c1c19',
  onSurfaceVariant: '#56423e',
  outline: '#89726d',
  outlineVariant: '#ddc0ba',
  primary: '#9f402d',
  primaryContainer: '#e2725b',
  primaryFixed: '#ffdad3',
  inversePrimary: '#ffb4a5',
  onPrimary: '#ffffff',
  onPrimaryFixedVariant: '#802918',
  secondary: '#006496',
  secondaryContainer: '#77c2fe',
  onSecondaryContainer: '#004f79',
  secondaryFixed: '#cce5ff',
  tertiary: '#805533',
  tertiaryContainer: '#bb8863',
  tertiaryFixedDim: '#f4bb92',
  tertiaryFixed: '#ffdcc5',
  onTertiaryFixed: '#301400',
  inverseSurface: '#31302d',
  woodDark: '#8b5e3c',
  woodLight: '#a67c52',
  rug: '#f4f0eb',
  rugPattern: '#e6e2dd',
  hair: '#56423e',
  hairDark: '#3b2b28',
});

/**
 * Typography. Plus Jakarta Sans carries every heading and UI label, with
 * Be Vietnam Pro for body copy, matching the Stitch type ramp.
 */
export const FONTS = Object.freeze({
  heading: '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif',
  body: '"Fredoka", "Arial Rounded MT Bold", system-ui, sans-serif',
});

/**
 * Builds a canvas font string.
 *
 * @param {number|string} weight CSS font weight.
 * @param {number} size Font size in CSS pixels.
 * @param {string} [family=FONTS.heading] Font family stack.
 * @returns {string} A value for ctx.font.
 */
export function font(weight, size, family = FONTS.heading) {
  return `${weight} ${size}px ${family}`;
}

