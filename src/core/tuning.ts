/**
 * Every tunable number of the game rules, in one place. Tweak these on a real
 * phone; nothing else in src/core should hold a magic number for feel.
 */
export const TUNING = {
  round: {
    /** 出局 that end 一局. */
    maxOuts: 10,
  },
  pitch: {
    /** Windup: from the start of a pitch until the ball leaves the hand. */
    windupMs: 1400,
    /** Release point to the contact point at the plate, metres. */
    flightDistance: 17.4,
    /**
     * 球速 range (mph) of each 球種 at each 球速 level; each pitch picks a speed
     * inside its range. 直球 > 變速球 > 曲球 at the same level (原型 v6).
     */
    speedMph: {
      fastball: { slow: { min: 78, max: 82 }, medium: { min: 86, max: 90 }, fast: { min: 94, max: 99 } },
      changeup: { slow: { min: 68, max: 72 }, medium: { min: 76, max: 80 }, fast: { min: 84, max: 88 } },
      curveball: { slow: { min: 62, max: 66 }, medium: { min: 70, max: 74 }, fast: { min: 78, max: 82 } },
    },
    /** How far (m) a 曲球 drops below a straight line over its flight. */
    curveDropM: 0.9,
  },
  swing: {
    /** |timing error| ≤ this (ms) is Perfect and always a home run. */
    perfectWindowMs: 15,
    /** |timing error| > this (ms) misses the ball: 揮空. Between foul and this is still a foul. */
    contactWindowMs: 130,
    /** Swings this long past the contact window still count (as a late whiff) before it's 沒揮棒. */
    deadlineGraceMs: 120,
  },
  direction: {
    /** Direction angle (deg) per ms of timing error: early → left (−), late → right (+). */
    degPerMs: 0.55,
  },
  batted: {
    /** Distance range (m) inside the perfect window: dead centre → edge. */
    perfectDistance: { max: 150, min: 135 },
    /** Outside the perfect window, distance drops this many metres per extra ms of error… */
    falloffMPerMs: 1.0,
    /** …but never below this (a weak dribbler). */
    minDistance: 15,
  },
  randomness: {
    /** 隨機幅度 when the player hasn't set one: 0.25 → about ±5% 飛距離. */
    default: 0.25,
    /** At 隨機幅度 100%, 飛距離 varies by up to ± this fraction… */
    maxDistanceSpread: 0.2,
    /** …and the direction angle by up to ± this many degrees. Both scale linearly with 隨機幅度. */
    maxAngleSpreadDeg: 10,
  },
  cinematic: {
    /** A 全壘打 this long (m) or longer plays the full 全壘打演出, as does any 打碎. */
    fullDistance: 140,
  },
  smash: {
    /** Chance that hitting a 設施 打碎 it, at the near and far 飛距離 (m); linear between, clamped outside. */
    near: { distance: 120, chance: 0.2 },
    far: { distance: 150, chance: 0.8 },
  },
} as const;
