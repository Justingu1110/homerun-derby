/**
 * Appearance params: everything that makes one character look different from
 * another. The renderer builds a character from these alone, so a future
 * custom-character editor only has to produce one of these.
 */
export interface Appearance {
  /** Jersey (shirt) colour, `#rrggbb`. */
  jersey: string;
  pants: string;
  /** Cap for the pitcher, batting helmet for the batter. */
  cap: string;
  /** Jersey number and cap badge colour. */
  trim: string;
  glove: string;
  skin: string;
  /** Jersey number on the back: one or two digits. */
  number: string;
}

export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  jersey: '#f7f7f7',
  pants: '#f7f7f7',
  cap: '#d6322b',
  trim: '#d6322b',
  glove: '#ffffff',
  skin: '#ffd9b5',
  number: '55',
};

const COLOR_KEYS = ['jersey', 'pants', 'cap', 'trim', 'glove', 'skin'] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const JERSEY_NUMBER = /^[0-9]{1,2}$/;

/**
 * A full set of appearance params: the given ones on top of the defaults.
 * Throws if a colour is not `#rrggbb` or the number is not one or two digits.
 */
export function makeAppearance(overrides: Partial<Appearance> = {}): Appearance {
  const look = { ...DEFAULT_APPEARANCE, ...overrides };
  for (const key of COLOR_KEYS) {
    if (!HEX_COLOR.test(look[key])) throw new Error(`appearance ${key} must be #rrggbb, got "${look[key]}"`);
  }
  if (!JERSEY_NUMBER.test(look.number)) throw new Error(`appearance number must be 1–2 digits, got "${look.number}"`);
  return look;
}
