import { describe, expect, it } from 'vitest';
import { DIFFICULTIES, makeAppearance, pitcherOf, type DifficultyId } from './index';

/** The ticket's table (#20): 球衣, 字樣, 帽子/袖套/腰帶/鞋, 背號, 體型與特色. */
const WHITE = '#f6f6f6';
const GRAY = '#b9bec8';
const DODGER_BLUE = '#1e4fa3';
const RED = '#e0393e';
const PINK = '#ff8fc0';

describe('投手: each 難度 has its own 投手 look', () => {
  it('Luna (簡易): all white, pink K2B, pink cap/sleeves/belt/shoes, #0, a small kid with a bigger head and pigtails', () => {
    const { look } = pitcherOf('easy');
    expect(look).toMatchObject({ jersey: WHITE, pants: WHITE, team: 'K2B', number: '0', nameOnBack: 'LUNA', hairStyle: 'pigtails', cap: PINK, sleeve: PINK, belt: PINK, shoe: PINK });
    expect(look.scale).toBeLessThan(0.8);
    expect(look.headScale).toBeGreaterThan(1);
  });

  it('Glasnow (普通): white, blue Dodgers, #31, tall and thin with long hair', () => {
    const { look } = pitcherOf('normal');
    expect(look).toMatchObject({ jersey: WHITE, team: 'Dodgers', trim: DODGER_BLUE, number: '31', nameOnBack: 'GLASNOW', hairStyle: 'long', cap: DODGER_BLUE, sleeve: DODGER_BLUE });
    expect(look.scale).toBeGreaterThan(1);
    expect(look.width).toBeLessThan(1);
  });

  it('Snell (困難): light grey, blue Dodgers, #7, big, mustache and goatee, left-handed', () => {
    const { look } = pitcherOf('hard');
    expect(look).toMatchObject({ jersey: GRAY, team: 'Dodgers', number: '7', nameOnBack: 'SNELL', beard: 'mustache', goatee: true, lefty: true, cap: DODGER_BLUE });
    expect(look.scale).toBeGreaterThan(1);
    expect(look.width).toBeGreaterThan(1);
  });

  it('Otani (極難): white, blue Dodgers, #17, big', () => {
    const { look } = pitcherOf('expert');
    expect(look).toMatchObject({ jersey: WHITE, team: 'Dodgers', number: '17', nameOnBack: 'OTANI', cap: DODGER_BLUE });
    expect(look.scale).toBeGreaterThan(1);
    expect(look.width).toBeGreaterThan(1);
  });

  it('Yamamoto (地獄): light grey, blue Dodgers, #18, average build', () => {
    const { look } = pitcherOf('hell');
    expect(look).toMatchObject({ jersey: GRAY, team: 'Dodgers', number: '18', nameOnBack: 'YAMAMOTO', cap: DODGER_BLUE, scale: 1, width: 1, torsoHeight: 1 });
  });

  it('front numbers are red, Luna pink', () => {
    expect(pitcherOf('easy').look.frontNumberColor).toBe('#ff6fae');
    for (const id of ['normal', 'hard', 'expert', 'hell'] as const) expect(pitcherOf(id).look.frontNumberColor).toBe(RED);
  });

  it('only Snell throws left-handed', () => {
    expect(DIFFICULTIES.filter((d) => pitcherOf(d.id).look.lefty).map((d) => d.pitcher)).toEqual(['Snell']);
  });

  it('every look is a valid set of appearance params', () => {
    for (const d of DIFFICULTIES) {
      const { look } = pitcherOf(d.id);
      expect(makeAppearance(look)).toEqual(look);
    }
  });

  it('the name on the back is the 難度 table\'s 投手 name', () => {
    for (const d of DIFFICULTIES) expect(pitcherOf(d.id).look.nameOnBack).toBe(d.pitcher.toUpperCase());
  });

  it('throws on an unknown 難度', () => {
    expect(() => pitcherOf('nightmare' as DifficultyId)).toThrow();
  });
});

describe('投手 effects: stronger with each 難度', () => {
  it('簡易 none, 普通 sparkle, 困難 whirlwind rings, 極難 blue lightning, 地獄 inferno', () => {
    expect(DIFFICULTIES.map((d) => pitcherOf(d.id).aura)).toEqual(['none', 'sparkle', 'whirlwind', 'lightning', 'inferno']);
  });
});
