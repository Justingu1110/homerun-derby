/**
 * Appearance params: everything that makes one character look different from
 * another. The renderer builds a character from these alone, so a future
 * custom-character editor (or a new 投手) only has to produce one of these.
 */

/** Hair below the cap: always a short band; 'long' adds shoulder-length curls, 'pigtails' two little tails. */
export const HAIR_STYLES = ['none', 'long', 'pigtails'] as const;
export type HairStyle = (typeof HAIR_STYLES)[number];
export const BEARDS = ['none', 'mustache'] as const;
export type Beard = (typeof BEARDS)[number];

export interface Appearance {
  /** Jersey (shirt) colour, `#rrggbb`. */
  jersey: string;
  pants: string;
  /** Cap for the pitcher, batting helmet for the batter. */
  cap: string;
  /** Team script, name and back number on the jersey, and the cap badge. */
  trim: string;
  /** Fielding glove; the batter's batting gloves. */
  glove: string;
  skin: string;
  /** Jersey number (front and back): one or two digits. */
  number: string;
  /** Whole figure, 1 = a grown player; a kid is about 0.75. */
  scale: number;
  /** Body girth. */
  width: number;
  /** Torso height (the head sits on top of it). */
  torsoHeight: number;
  /** Head size relative to the body. */
  headScale: number;
  /** Hair, brows and facial hair colour. */
  hair: string;
  hairStyle: HairStyle;
  beard: Beard;
  goatee: boolean;
  /** Undershirt sleeve shown as a cuff beside each hand; null = no cuffs. */
  sleeve: string | null;
  belt: string;
  /** Shoe upper (the toe and sole are white). */
  shoe: string;
  /** Team name in script across the jersey front. */
  team: string;
  /** Colour of the small number on the jersey front. */
  frontNumberColor: string;
  /** Name across the jersey back, in capitals; may be empty. */
  nameOnBack: string;
  /** Throws left-handed: the right-hander's motion, mirrored. */
  lefty: boolean;
}

export const DEFAULT_APPEARANCE: Readonly<Appearance> = {
  jersey: '#f7f7f7',
  pants: '#f7f7f7',
  cap: '#d6322b',
  trim: '#d6322b',
  glove: '#ffffff',
  skin: '#ffd9b5',
  number: '55',
  scale: 1,
  width: 1,
  torsoHeight: 1,
  headScale: 1,
  hair: '#2a1d16',
  hairStyle: 'none',
  beard: 'none',
  goatee: false,
  sleeve: null,
  belt: '#20202a',
  shoe: '#d6322b',
  team: 'Moons',
  frontNumberColor: '#d6322b',
  nameOnBack: 'GU',
  lefty: false,
};

const COLOR_KEYS = ['jersey', 'pants', 'cap', 'trim', 'glove', 'skin', 'hair', 'belt', 'shoe', 'frontNumberColor'] as const;
const PROPORTION_KEYS = ['scale', 'width', 'torsoHeight', 'headScale'] as const;
/** Proportions are multipliers on the standard figure. */
const PROPORTION_RANGE = [0.6, 1.5] as const;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const JERSEY_NUMBER = /^[0-9]{1,2}$/;
const NAME_ON_BACK = /^[A-Z .'-]{0,12}$/;
const TEAM_MAX = 12;

/**
 * A full set of appearance params: the given ones on top of the defaults.
 * Throws if a param is out of bounds: a colour that is not `#rrggbb`, a number
 * that is not one or two digits, an unknown hair style or beard, a proportion
 * outside 0.6–1.5, a blank or over-long team name, or a name on the back that
 * is not capitals.
 */
export function makeAppearance(overrides: Partial<Appearance> = {}): Appearance {
  const look = { ...DEFAULT_APPEARANCE, ...overrides };
  for (const key of COLOR_KEYS) {
    if (!HEX_COLOR.test(look[key])) throw new Error(`appearance ${key} must be #rrggbb, got "${look[key]}"`);
  }
  if (look.sleeve !== null && !HEX_COLOR.test(look.sleeve)) throw new Error(`appearance sleeve must be #rrggbb or null, got "${look.sleeve}"`);
  for (const key of PROPORTION_KEYS) {
    const v = look[key];
    if (!(v >= PROPORTION_RANGE[0] && v <= PROPORTION_RANGE[1])) throw new Error(`appearance ${key} must be ${PROPORTION_RANGE.join('–')}, got ${v}`);
  }
  if (!(HAIR_STYLES as readonly string[]).includes(look.hairStyle)) throw new Error(`appearance hairStyle must be one of ${HAIR_STYLES.join(', ')}, got "${look.hairStyle}"`);
  if (!(BEARDS as readonly string[]).includes(look.beard)) throw new Error(`appearance beard must be one of ${BEARDS.join(', ')}, got "${look.beard}"`);
  for (const key of ['goatee', 'lefty'] as const) {
    if (typeof look[key] !== 'boolean') throw new Error(`appearance ${key} must be true or false, got "${look[key]}"`);
  }
  if (!JERSEY_NUMBER.test(look.number)) throw new Error(`appearance number must be 1–2 digits, got "${look.number}"`);
  if (typeof look.team !== 'string' || !look.team.trim() || [...look.team].length > TEAM_MAX) {
    throw new Error(`appearance team must be 1–${TEAM_MAX} characters, got "${look.team}"`);
  }
  if (!NAME_ON_BACK.test(look.nameOnBack)) throw new Error(`appearance nameOnBack must be up to 12 capitals (A–Z, space, . ' -), got "${look.nameOnBack}"`);
  return look;
}
