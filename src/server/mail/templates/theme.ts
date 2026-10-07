/**
 * The light values of the design tokens in docs/design-system/DESIGN.md, as plain hex.
 * Email clients do not read CSS variables, so the tokens are copied here by name.
 */
export const color = {
  bg: '#f5f8fa',
  surface: '#ffffff',
  surfaceSubtle: '#edf3f7',
  border: '#dbe6ee',
  ink: '#10303f',
  inkMuted: '#456072',
  inkSubtle: '#5a7184',
  brand: '#1a7cb5',
  onBrand: '#ffffff',
  brandBg: '#e3f2fa',
  brandFg: '#0e5a85',
  success: '#1d7a4b',
  successBg: '#e2f4ea',
  successFg: '#14603a',
  warning: '#a35f00',
  warningBg: '#fcf0d9',
  warningFg: '#7a4700',
  danger: '#b3332c',
  dangerBg: '#fbe9e7',
  dangerFg: '#8f2620',
  neutral: '#5a7184',
  neutralBg: '#e8eff4',
  neutralFg: '#3b5365',
} as const;

export const FONT_STACK =
  'Poppins, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif';

export type Tone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

/** Solid, tint and text colors for a status, as in the status system. */
export const TONES: Record<Tone, { solid: string; bg: string; fg: string }> = {
  brand: { solid: color.brand, bg: color.brandBg, fg: color.brandFg },
  success: { solid: color.success, bg: color.successBg, fg: color.successFg },
  warning: { solid: color.warning, bg: color.warningBg, fg: color.warningFg },
  danger: { solid: color.danger, bg: color.dangerBg, fg: color.dangerFg },
  neutral: { solid: color.neutral, bg: color.neutralBg, fg: color.neutralFg },
};
