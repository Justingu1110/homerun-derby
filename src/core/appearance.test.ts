import { describe, expect, it } from 'vitest';
import { BEARDS, HAIR_STYLES, makeAppearance, type Beard, type HairStyle } from './index';

describe('appearance params', () => {
  it('fills every param from the defaults when nothing is given', () => {
    expect(makeAppearance()).toEqual({
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
    });
  });

  it('changes only the params that are given', () => {
    const look = makeAppearance({ jersey: '#2a4fb8', number: '18' });
    expect(look.jersey).toBe('#2a4fb8');
    expect(look.number).toBe('18');
    expect(look.cap).toBe('#d6322b');
  });

  it('rejects a jersey number that is not one or two digits', () => {
    for (const number of ['', '100', '7a', '-1']) expect(() => makeAppearance({ number })).toThrow(/number/);
  });

  it('rejects a colour that is not #rrggbb', () => {
    for (const glove of ['red', '#fff', '#12345g', '']) expect(() => makeAppearance({ glove })).toThrow(/glove/);
  });

  it('checks the new colours too: hair, belt, shoes, front number and sleeves', () => {
    for (const key of ['hair', 'belt', 'shoe', 'frontNumberColor', 'sleeve'] as const) {
      expect(() => makeAppearance({ [key]: 'blue' })).toThrow(key);
      expect(makeAppearance({ [key]: '#1e4fa3' })[key]).toBe('#1e4fa3');
    }
  });

  it('allows no sleeves', () => {
    expect(makeAppearance({ sleeve: null }).sleeve).toBeNull();
  });

  it('allows only the listed hair styles and beards', () => {
    for (const hairStyle of HAIR_STYLES) expect(makeAppearance({ hairStyle }).hairStyle).toBe(hairStyle);
    expect(HAIR_STYLES).toEqual(['none', 'long', 'pigtails']);
    expect(BEARDS).toEqual(['none', 'mustache']);
    expect(makeAppearance({ beard: 'mustache' }).beard).toBe('mustache');
    expect(() => makeAppearance({ hairStyle: 'mohawk' as HairStyle })).toThrow(/hairStyle/);
    expect(() => makeAppearance({ beard: 'full' as Beard })).toThrow(/beard/);
  });

  it('takes the goatee and left-handedness only as true or false', () => {
    expect(makeAppearance({ goatee: true, lefty: true })).toMatchObject({ goatee: true, lefty: true });
    expect(() => makeAppearance({ goatee: 'yes' as unknown as boolean })).toThrow(/goatee/);
    expect(() => makeAppearance({ lefty: 1 as unknown as boolean })).toThrow(/lefty/);
  });

  it('takes body proportions between 0.6 and 1.5 (a kid is about 0.75)', () => {
    expect(makeAppearance({ scale: 0.76, width: 1.15, torsoHeight: 1.12, headScale: 1.1 })).toMatchObject({
      scale: 0.76,
      width: 1.15,
      torsoHeight: 1.12,
      headScale: 1.1,
    });
    for (const key of ['scale', 'width', 'torsoHeight', 'headScale'] as const) {
      for (const bad of [0, -1, 0.4, 1.8, Number.NaN]) expect(() => makeAppearance({ [key]: bad })).toThrow(key);
    }
  });

  it('needs a team name of 1–12 characters for the jersey front', () => {
    expect(makeAppearance({ team: 'Dodgers' }).team).toBe('Dodgers');
    expect(makeAppearance({ team: 'K2B' }).team).toBe('K2B');
    for (const team of ['', '   ', 'Thirteen chars']) expect(() => makeAppearance({ team })).toThrow(/team/);
  });

  it('takes the name on the back in capitals, up to 12 characters, or none', () => {
    for (const nameOnBack of ['YAMAMOTO', "O'NEIL", 'DE LA CRUZ', '']) expect(makeAppearance({ nameOnBack }).nameOnBack).toBe(nameOnBack);
    for (const nameOnBack of ['Snell', '大谷', 'ABCDEFGHIJKLM']) expect(() => makeAppearance({ nameOnBack })).toThrow(/nameOnBack/);
  });
});
