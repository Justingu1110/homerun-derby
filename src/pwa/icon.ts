import { crc32, deflateSync } from 'node:zlib';
import { THEME_COLOR } from './manifest';

/**
 * The home screen icon, drawn in code at build time (no art files, per ADR 0001):
 * a baseball with red seams on the game's navy, full-bleed so iOS can round the
 * corners and Android can mask it. The ball stays inside the maskable safe zone.
 */

type RGB = readonly [number, number, number];

const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

const ICON = {
  bg: hex(THEME_COLOR),
  glow: hex('#ffd400'),
  ball: hex('#ffffff'),
  ballShade: hex('#e6e9f2'),
  ink: hex('#1b1124'),
  seam: hex('#d6322b'),
  /** In units of the icon size; the maskable safe zone is a circle of radius 0.4. */
  ballRadius: 0.33,
  inkWidth: 0.022,
  glowRadius: 0.46,
  /** Seams: arcs of circles this far left/right of centre, with this radius. */
  seamOffset: 0.62,
  seamRadius: 0.5,
  seamWidth: 0.02,
  stitchReach: 0.05,
  stitchesPerRadian: 7.5,
  /** Samples per pixel along each axis. */
  supersample: 4,
} as const;

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Colour at a point, x and y in [0, 1] from the top-left. */
function colorAt(x: number, y: number): RGB {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  const R = ICON.ballRadius;
  if (r > R + ICON.inkWidth) {
    const glow = Math.max(0, 1 - (r - R) / (ICON.glowRadius - R));
    return mix(ICON.bg, ICON.glow, 0.35 * glow * glow);
  }
  if (r > R) return ICON.ink;
  for (const side of [-1, 1]) {
    const sx = dx - side * ICON.seamOffset;
    const d = Math.hypot(sx, dy) - ICON.seamRadius;
    if (Math.abs(d) < ICON.seamWidth / 2) return ICON.seam;
    // Stitches: short ticks across the seam on its outer side.
    const a = Math.atan2(dy, sx) * ICON.stitchesPerRadian;
    if (d * -side < 0 && Math.abs(d) < ICON.stitchReach && a - Math.floor(a) < 0.3) return ICON.seam;
  }
  // Lit from the top-left, gently.
  const shade = Math.max(0, (dx + dy) / (R * 1.414));
  return mix(ICON.ball, ICON.ballShade, shade);
}

/** The icon as 8-bit RGBA pixels, row by row. */
export function drawIcon(size: number): Uint8Array {
  const n = ICON.supersample;
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const c = colorAt((x + (i + 0.5) / n) / size, (y + (j + 0.5) / n) / size);
          r += c[0];
          g += c[1];
          b += c[2];
        }
      const k = (y * size + x) * 4;
      px[k] = Math.round(r / (n * n));
      px[k + 1] = Math.round(g / (n * n));
      px[k + 2] = Math.round(b / (n * n));
      px[k + 3] = 255;
    }
  return px;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'latin1');
  out.set(data, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/** Encodes RGBA pixels as a PNG (8-bit RGBA, no row filters). */
export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.set([8, 6, 0, 0, 0], 8);
  const rows = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) rows.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * (width * 4 + 1) + 1);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', deflateSync(rows, { level: 9 })), chunk('IEND', new Uint8Array())]);
}

export const iconPng = (size: number) => encodePng(size, size, drawIcon(size));
