// Game core: pure TypeScript game rules. Must not import three.js or touch the DOM.
export { FIELD, fieldPoint } from './field';
export type { FieldPoint } from './field';
export { TUNING } from './tuning';
export { metresToFeet } from './units';
export { parseBestScore, readBestScore } from './bestScore';
export type { BestScore, BestScoreStorage } from './bestScore';
export { DEFAULT_DIFFICULTY, DIFFICULTIES, difficulty, homeRunPoints, parseDifficultyId } from './difficulty';
export type { Difficulty, DifficultyId } from './difficulty';
export { PITCH_TYPES, PITCH_TYPE_NAME, SPEED_LEVELS, SPEED_LEVEL_NAME } from './pitch';
export { startRound } from './round';
export type { BattedBall, CinematicVersion, HomeRun, Out, OutKind, Pitch, PitchResult, PitchType, RandomSource, Round, RoundOptions, RoundState, SpeedLevel, TimingGrade } from './round';
export { DEFAULT_APPEARANCE, makeAppearance } from './appearance';
export type { Appearance } from './appearance';
export { FACILITIES, facilityHalfSpanDeg } from './facilities';
export type { Facility, FacilityKind, Landing } from './facilities';
