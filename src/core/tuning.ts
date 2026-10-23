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
     * Speed range (km/h) of each 球種 at each 球速 level; each pitch picks a speed
     * inside its range. 變速球 and 曲球 are slower than 直球 at the same level.
     */
    speedKmh: {
      fastball: { slow: { min: 96, max: 102 }, medium: { min: 112, max: 118 }, fast: { min: 130, max: 136 } },
      changeup: { slow: { min: 80, max: 86 }, medium: { min: 92, max: 98 }, fast: { min: 106, max: 112 } },
      curveball: { slow: { min: 78, max: 84 }, medium: { min: 90, max: 96 }, fast: { min: 102, max: 108 } },
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
  smash: {
    /** Chance that hitting a 設施 打碎 it, at the near and far 飛距離 (m); linear between, clamped outside. */
    near: { distance: 120, chance: 0.2 },
    far: { distance: 150, chance: 0.8 },
  },
} as const;
