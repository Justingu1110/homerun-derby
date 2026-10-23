import { describe, expect, it } from 'vitest';
import { makeAppearance } from './index';

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
});
