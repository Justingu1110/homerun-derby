import { Object3D, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { makeAppearance } from '../core';
import { GLOVE_RADIUS, HAND_RADIUS, HEAD_RADIUS, buildSkeleton } from './character';
import {
  CONTACT_POINT,
  MOUND,
  PITCH_END,
  PITCH_RELEASE,
  PITCH_RESET,
  STANCE_END,
  SWING_TO_CONTACT_MS,
  batClearance,
  batterPose,
  pitcherPose,
  posePitcher,
  releasePoint,
  stanceTime,
  sweetSpot,
  swingProgress,
  windupTime,
} from './poses';

const righty = makeAppearance();
const lefty = makeAppearance({ lefty: true });

/** World position of each part of a bare pitcher posed at t. */
function pitcherAt(look = righty, t: number) {
  const rig = { ...buildSkeleton(look), hands: [new Object3D(), new Object3D()] as [Object3D, Object3D] };
  rig.root.add(...rig.hands);
  posePitcher(rig, pitcherPose(t, look.lefty));
  const w = (o: { getWorldPosition(v: Vector3): Vector3 }) => o.getWorldPosition(new Vector3());
  rig.root.updateWorldMatrix(true, true);
  return { ballHand: w(rig.hands[0]), glove: w(rig.hands[1]), feet: rig.feet.map(w), head: w(rig.head) };
}

describe('left-handed pitcher', () => {
  it('is the right-hander mirrored across the mound, all through the motion', () => {
    for (let t = 0; t <= PITCH_END; t += 0.1) {
      const r = pitcherAt(righty, t);
      const l = pitcherAt(lefty, t);
      for (const [a, b] of [
        [r.ballHand, l.ballHand],
        [r.glove, l.glove],
        [r.feet[0], l.feet[0]],
        [r.feet[1], l.feet[1]],
        [r.head, l.head],
      ]) {
        expect(b.x).toBeCloseTo(-a.x, 9);
        expect(b.y).toBeCloseTo(a.y, 9);
        expect(b.z).toBeCloseTo(a.z, 9);
      }
    }
  });

  it('turns the other way', () => {
    expect(pitcherPose(1.0, true).turn).toBeCloseTo(-pitcherPose(1.0, false).turn, 9);
    expect(pitcherPose(1.0, false).turn).not.toBe(0);
  });

  it('releases on the throwing-hand side: a right-hander on −x (third-base side), a left-hander on +x', () => {
    expect(pitcherAt(righty, PITCH_RELEASE).ballHand.x).toBeLessThan(-0.1);
    expect(pitcherAt(lefty, PITCH_RELEASE).ballHand.x).toBeGreaterThan(0.1);
  });
});

describe('release point', () => {
  const kid = makeAppearance({ scale: 0.76 });
  const tall = makeAppearance({ scale: 1.1, torsoHeight: 1.1 });

  it('is where the ball hand is at release', () => {
    for (const look of [righty, lefty, kid, tall]) {
      const hand = pitcherAt(look, PITCH_RELEASE).ballHand;
      const r = releasePoint(look);
      expect(r.distanceTo(hand)).toBeLessThan(1e-9);
    }
  });

  it('is high and out in front of the rubber, about 1.6 m above the field for a standard pitcher', () => {
    const r = releasePoint(righty);
    expect(r.y).toBeGreaterThan(1.4);
    expect(r.y).toBeLessThan(2.1);
    expect(r.z).toBeGreaterThan(MOUND.z + 0.5);
  });

  it('follows the pitcher: a kid releases lower than a tall pitcher, a left-hander on the other side', () => {
    expect(releasePoint(kid).y).toBeLessThan(releasePoint(tall).y - 0.3);
    const r = releasePoint(righty);
    const l = releasePoint(lefty);
    expect(l.x).toBeCloseTo(-r.x, 9);
    expect(l.y).toBeCloseTo(r.y, 9);
  });
});

describe('pitcher hands', () => {
  /** Gap between a hand and the head (sphere to sphere, world metres); < 0 means the hand covers the face. */
  const faceGap = (look: typeof righty, t: number) => {
    const p = pitcherAt(look, t);
    const head = HEAD_RADIUS * look.headScale * look.scale;
    return Math.min(
      p.ballHand.distanceTo(p.head) - head - HAND_RADIUS * look.scale,
      p.glove.distanceTo(p.head) - head - GLOVE_RADIUS * look.scale,
    );
  };

  it('stay below the face in the set position, and on the way back to it', () => {
    for (const look of [righty, makeAppearance({ scale: 0.76, headScale: 1.1 }), makeAppearance({ torsoHeight: 1.12 })]) {
      for (let t = 0; t <= 0.4; t += 0.05) expect(faceGap(look, t)).toBeGreaterThan(0);
      for (let t = 2.9; t <= PITCH_RESET; t += 0.05) expect(faceGap(look, t)).toBeGreaterThan(0);
    }
  });

  it('come up to the chest, not over the face, at the top of the leg kick', () => {
    expect(faceGap(righty, 0.9)).toBeGreaterThan(-0.02);
  });
});

describe('batter', () => {
  it('meets an on-time pitch with the sweet spot where v1 did (the contact point the core is tuned for)', () => {
    expect(CONTACT_POINT.x).toBeCloseTo(0.4176, 3);
    expect(CONTACT_POINT.y).toBeCloseTo(0.854, 3);
    expect(CONTACT_POINT.z).toBeCloseTo(0.2, 3);
    expect(sweetSpot(batterPose(STANCE_END, 0.4)).distanceTo(CONTACT_POINT)).toBeLessThan(1e-9);
  });

  it('starts the swing from where the stance left off', () => {
    const s = batterPose(STANCE_END, null);
    const w = batterPose(STANCE_END, 0);
    expect(w).toEqual(s);
  });

  /** Worst bat/hands-to-helmet gap over the whole stance, and swings started early (stride still up) or on time. */
  const worstClearance = (look: typeof righty) => {
    let worst = Infinity;
    for (let t = 0; t <= STANCE_END + 0.2; t += 0.01) worst = Math.min(worst, batClearance(look, batterPose(t, null)));
    for (const from of [1.5, STANCE_END]) {
      for (let a = 0; a <= 1; a += 0.005) worst = Math.min(worst, batClearance(look, batterPose(from, a)));
    }
    return worst;
  };

  it('keeps the bat and hands at least 0.10 m clear of the helmet all the way through', () => {
    expect(worstClearance(makeAppearance())).toBeGreaterThanOrEqual(0.1);
  });

  it('still clears the helmet of a batter with a bigger head', () => {
    expect(worstClearance(makeAppearance({ headScale: 1.1 }))).toBeGreaterThan(0);
  });
});

describe('motion timeline', () => {
  const pitch = (releaseMs: number, flightMs: number) => ({ releaseMs, flightMs, contactMs: releaseMs + flightMs });

  it('releases the ball the moment the core says, whatever the 球速', () => {
    for (const p of [pitch(1400, 393), pitch(1400, 630), pitch(1000, 500)]) {
      expect(windupTime(p.releaseMs, p)).toBeCloseTo(PITCH_RELEASE, 9);
      expect(windupTime(p.releaseMs / 2, p)).toBeCloseTo(PITCH_RELEASE / 2, 9);
    }
  });

  it('plants the front foot before contact, even on the fastest pitch', () => {
    const fast = pitch(1400, 393);
    expect(stanceTime(fast.contactMs - 100, fast)).toBeGreaterThanOrEqual(STANCE_END);
    expect(stanceTime(fast.releaseMs, fast)).toBeLessThan(STANCE_END);
  });

  it('brings the bat to the plate a fixed time after the tap, without slowing down at contact', () => {
    expect(swingProgress(0)).toBe(0);
    expect(swingProgress(SWING_TO_CONTACT_MS)).toBeCloseTo(0.4, 9);
    const h = 1e-4;
    const before = (swingProgress(SWING_TO_CONTACT_MS) - swingProgress(SWING_TO_CONTACT_MS - h)) / h;
    const after = (swingProgress(SWING_TO_CONTACT_MS + h) - swingProgress(SWING_TO_CONTACT_MS)) / h;
    expect(after).toBeCloseTo(before, 4);
    expect(swingProgress(5000)).toBe(1);
    for (let s = 0; s < 1000; s += 5) expect(swingProgress(s + 5)).toBeGreaterThanOrEqual(swingProgress(s));
  });
});
