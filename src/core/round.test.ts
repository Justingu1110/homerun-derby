import { describe, expect, it } from 'vitest';
import { FIELD, startRound } from './index';

const fixed = (v: number) => () => v;

describe('one pitch: pitch → swing → result', () => {
  it('a tap at the ideal contact moment (ms from the start of the pitch) is a Perfect home run', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    expect(round.swing(pitch.contactMs)!).toMatchObject({ kind: 'homeRun', timing: 'perfect' });
  });

  it('a swing inside the perfect window is always a home run', () => {
    for (const err of [-8, 0, 8]) {
      const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
      const pitch = round.nextPitch();
      const result = round.swing(pitch.contactMs + err)!;
      expect(result.kind).toBe('homeRun');
      expect(result.timing).toBe('perfect');
    }
  });
});

describe('direction follows timing', () => {
  const hit = (err: number) => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    return round.swing(pitch.contactMs + err)!;
  };

  it('an early swing is graded 太早 and pulled to the left', () => {
    const result = hit(-40);
    expect(result.timing).toBe('early');
    expect(result.ball!.angle).toBeLessThan(0);
  });

  it('a late swing is graded 太晚 and pushed to the right', () => {
    const result = hit(40);
    expect(result.timing).toBe('late');
    expect(result.ball!.angle).toBeGreaterThan(0);
  });

  it('the earlier the swing, the further left it goes', () => {
    expect(hit(-50).ball!.angle).toBeLessThan(hit(-25).ball!.angle);
  });
});

describe('outs', () => {
  const swingAt = (err: number) => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    return round.swing(pitch.contactMs + err)!;
  };

  it('a swing pulled or pushed past the foul line is a foul out', () => {
    for (const err of [-100, 100]) {
      const result = swingAt(err);
      expect(result).toMatchObject({ kind: 'out', out: 'foul' });
      expect(Math.abs(result.ball!.angle)).toBeGreaterThan(45);
    }
    expect(swingAt(-100).timing).toBe('early');
    expect(swingAt(100).timing).toBe('late');
  });

  it('a swing way off the timing misses the ball entirely (揮空)', () => {
    for (const err of [-200, 200]) {
      expect(swingAt(err)).toMatchObject({ kind: 'out', out: 'whiff', ball: null });
    }
    expect(swingAt(-200).timing).toBe('early');
    expect(swingAt(200).timing).toBe('late');
  });

  it('letting the pitch go by without swinging is an out (沒揮棒) once the swing deadline has passed', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    expect(round.tick(pitch.contactMs)).toBeNull();
    expect(round.tick(pitch.swingDeadlineMs)).toBeNull();
    expect(round.tick(pitch.swingDeadlineMs + 1)).toEqual({ kind: 'out', out: 'noSwing', timing: null, ball: null });
    expect(round.state().outs).toBe(1);
  });

  it('a tap that was ignored after the deadline still ends in 沒揮棒', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    round.swing(pitch.swingDeadlineMs + 5);
    expect(round.tick(pitch.swingDeadlineMs + 10)).toMatchObject({ kind: 'out', out: 'noSwing' });
  });

  it('a fair ball that falls short of the wall is a fly out (界內球)', () => {
    const result = swingAt(60);
    expect(result).toMatchObject({ kind: 'out', out: 'flyOut', timing: 'late' });
    expect(Math.abs(result.ball!.angle)).toBeLessThanOrEqual(45);
    expect(result.ball!.distance).toBeLessThan(FIELD.fenceDistance);
  });
});

describe('distance follows timing', () => {
  const distanceAt = (err: number) => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    return round.swing(pitch.contactMs + err)!.ball!.distance;
  };

  it('the bigger the timing error, the shorter the ball flies', () => {
    expect(distanceAt(0)).toBeGreaterThan(distanceAt(10));
    expect(distanceAt(-20)).toBeGreaterThan(distanceAt(-40));
    expect(distanceAt(40)).toBeGreaterThan(distanceAt(70));
  });

  it('every home run clears the wall', () => {
    for (let err = -130; err <= 130; err += 1) {
      const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
      const pitch = round.nextPitch();
      const result = round.swing(pitch.contactMs + err)!;
      if (result.kind === 'homeRun') expect(result.ball.distance).toBeGreaterThanOrEqual(FIELD.fenceDistance);
    }
  });
});

describe('pitches', () => {
  it('draws its pitch from the injected random source', () => {
    const slow = startRound({ random: fixed(0), difficulty: 'easy' }).nextPitch();
    const fast = startRound({ random: fixed(0.999), difficulty: 'easy' }).nextPitch();
    expect(startRound({ random: fixed(0), difficulty: 'easy' }).nextPitch()).toEqual(slow);
    expect(slow.type).toBe('fastball');
    expect(fast.mph).toBeGreaterThan(slow.mph);
    expect(fast.flightMs).toBeLessThan(slow.flightMs);
  });

  it('the ideal contact moment comes after the windup and the flight to the plate', () => {
    const pitch = startRound({ random: fixed(0.5), difficulty: 'easy' }).nextPitch();
    expect(pitch.releaseMs).toBeGreaterThan(0);
    expect(pitch.contactMs).toBeCloseTo(pitch.releaseMs + pitch.flightMs);
  });

  it('each pitch takes exactly one result', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    expect(() => round.swing(0)).toThrow();
    const pitch = round.nextPitch();
    round.swing(pitch.contactMs)!;
    expect(() => round.swing(pitch.contactMs)).toThrow();
    expect(() => round.tick(pitch.swingDeadlineMs + 1)).toThrow();
    const next = round.nextPitch();
    expect(round.tick(next.swingDeadlineMs + 1)!.kind).toBe('out');
  });

  it('any swing before the swing deadline still counts as a swing', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    expect(pitch.swingDeadlineMs).toBeGreaterThan(pitch.contactMs);
    expect(round.swing(pitch.swingDeadlineMs - 1)).toMatchObject({ kind: 'out', out: 'whiff', timing: 'late' });
  });

  it('a tap after the swing deadline is not a swing: it is ignored and the pitch still waits for its result', () => {
    const round = startRound({ random: fixed(0.5), difficulty: 'easy' });
    const pitch = round.nextPitch();
    expect(round.swing(pitch.swingDeadlineMs + 1)).toBeNull();
    expect(round.state().outs).toBe(0);
  });
});
