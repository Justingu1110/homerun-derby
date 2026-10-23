import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { iconPng } from './icon';

/** Minimal PNG reader for 8-bit RGBA, unfiltered rows. */
function readPng(png: Buffer) {
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let at = 8;
  let width = 0;
  let height = 0;
  const idat: Buffer[] = [];
  while (at < png.length) {
    const len = png.readUInt32BE(at);
    const type = png.toString('latin1', at + 4, at + 8);
    const data = png.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([data[8], data[9]]).toEqual([8, 6]); // 8-bit RGBA
    }
    if (type === 'IDAT') idat.push(data);
    at += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4 + 1;
  return {
    width,
    height,
    pixel(x: number, y: number) {
      expect(raw[y * stride]).toBe(0);
      const i = y * stride + 1 + x * 4;
      return [raw[i], raw[i + 1], raw[i + 2], raw[i + 3]];
    },
  };
}

const NAVY = [0x0e, 0x13, 0x30, 255];

describe('home screen icon: a baseball on the game navy, drawn in code', () => {
  it.each([180, 192, 512])('is a %i px square PNG', (size) => {
    const png = readPng(iconPng(size));
    expect([png.width, png.height]).toEqual([size, size]);
  });

  it('is opaque navy to the corners (iOS rounds them itself; Android masks them)', () => {
    const png = readPng(iconPng(192));
    expect(png.pixel(0, 0)).toEqual(NAVY);
    expect(png.pixel(191, 191)).toEqual(NAVY);
  });

  it('has a white ball in the middle', () => {
    const png = readPng(iconPng(192));
    const [r, g, b, a] = png.pixel(96 - 20, 96 + 20); // between the seams
    expect(Math.min(r, g, b)).toBeGreaterThan(220);
    expect(a).toBe(255);
  });

  it('keeps the ball inside the maskable safe zone (a circle of 40% of the size)', () => {
    const png = readPng(iconPng(512));
    for (const [x, y] of [
      [256, 256 - 205],
      [256 + 205, 256],
      [256, 256 + 205],
      [256 - 205, 256],
    ]) {
      const [r, g, b] = png.pixel(x, y);
      expect(Math.max(r, g, b)).toBeLessThan(200); // no white ball out here
    }
  });
});
