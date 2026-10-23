// Game core: pure TypeScript game rules. Must not import three.js or touch the DOM.
export { FIELD, fieldPoint } from './field';
export type { FieldPoint } from './field';
export { TUNING } from './tuning';
export { readBestScore } from './bestScore';
export type { BestScore, BestScoreStorage } from './bestScore';
export { difficultyMultiplier, homeRunPoints } from './difficulty';
export { DEFAULT_PITCH_SETTINGS, PITCH_TYPES, SPEED_LEVELS, parsePitchSettings, togglePitchType } from './pitchSettings';
export type { PitchSettings, SpeedLevel } from './pitchSettings';
export { startRound } from './round';
export type { BattedBall, HomeRun, Out, OutKind, Pitch, PitchResult, PitchType, RandomSource, Round, RoundOptions, RoundState, TimingGrade } from './round';
export { DEFAULT_APPEARANCE, makeAppearance } from './appearance';
export type { Appearance } from './appearance';
export { FACILITIES, facilityHalfSpanDeg } from './facilities';
export type { Facility, FacilityKind, Landing } from './facilities';
