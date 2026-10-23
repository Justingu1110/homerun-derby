/**
 * The 全壘打演出's 2D layer over the canvas: letterbox bars, speed lines, the
 * white flash, the pop-up words (PERFECT!, HOME RUN!!, 看板粉碎！…), the big
 * 飛距離 and the skip hint.
 *
 * Nothing here runs a CSS animation or a timer: the director calls render(now)
 * every frame and every style is computed from timestamps it set, so the layer
 * follows the same clock as the 3D scene (and a paused test clock).
 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => v * v * (3 - 2 * v);
const easeOut = (v: number) => 1 - (1 - v) * (1 - v);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Presentation timings of the 2D layer, ms. */
const LOOK = {
  letterboxMs: 350,
  speedFadeMs: 250,
  /** Speed lines turn this many degrees per second. */
  speedSpinDegPerS: 5,
  flashMs: 280,
  flashPeak: 0.95,
  popMs: 1150,
  distanceFadeMs: 300,
  distanceCountMs: 700,
} as const;

/** Pop keyframes (from the prototype): [progress, opacity, scale, rotation deg]. */
const POP_KEYS: [number, number, number, number][] = [
  [0, 0, 2.4, -6],
  [0.14, 1, 0.92, -3],
  [0.24, 1, 1.04, -3],
  [0.8, 1, 1, -3],
  [1, 0, 1, -3],
];

/** A span of time [onMs, offMs) during which something is shown, with fades at both ends. */
interface Span {
  onMs: number;
  offMs: number;
}

const fade = (s: Span | null, now: number, ms: number) =>
  !s ? 0 : Math.min(clamp01((now - s.onMs) / ms), 1 - clamp01((now - s.offMs) / ms));

export interface CinematicOverlay {
  /** Letterbox bars between these times (they slide in and out). */
  letterbox(onMs: number, offMs: number): void;
  speedLines(onMs: number, offMs: number): void;
  /** "點畫面跳過" hint. */
  skipHint(onMs: number, offMs: number): void;
  /** A white flash starting at this time (callers skip it for reduced motion). */
  flash(atMs: number): void;
  /**
   * Pops up a word at this time; `small` is the white secondary style. Line 0 is the
   * main line (PERFECT!, HOME RUN!!), line 1 sits lower so an impact word can follow
   * HOME RUN!! without cutting it off.
   */
  pop(text: string, atMs: number, small?: boolean, line?: 0 | 1): void;
  /** Shows 飛距離 (counting up) from onMs until offMs. */
  distance(metres: number, onMs: number, offMs: number): void;
  /** Hides everything that is showing or scheduled. */
  clear(): void;
  render(nowMs: number, reducedMotion: boolean): void;
}

export function createCinematicOverlay(root: HTMLElement): CinematicOverlay {
  root.innerHTML =
    '<div class="cine-bar cine-bar-top"></div><div class="cine-bar cine-bar-bottom"></div>' +
    '<div class="cine-speed"></div><div class="cine-flash"></div><div class="cine-pop"></div><div class="cine-pop cine-pop-low"></div>' +
    '<div class="cine-distance"><small>飛距離</small><b>0</b><span>m</span></div>' +
    '<div class="cine-skip">點畫面跳過 ▶▶</div>';
  const q = (s: string) => root.querySelector<HTMLElement>(s)!;
  const bars = [q('.cine-bar-top'), q('.cine-bar-bottom')];
  const speed = q('.cine-speed');
  const flashEl = q('.cine-flash');
  const popEls = [...root.querySelectorAll<HTMLElement>('.cine-pop')];
  const dist = q('.cine-distance');
  const distN = q('.cine-distance b');
  const skip = q('.cine-skip');

  let bar: Span | null = null;
  let lines: Span | null = null;
  let hint: Span | null = null;
  let flashAt = -Infinity;
  type Pop = { text: string; small: boolean; atMs: number } | null;
  let popping: Pop[] = [null, null];
  const shownText = ['', ''];
  let distSpan: (Span & { metres: number }) | null = null;
  let shownMetres = -1;

  const popStyle = (u: number, reduced: boolean) => {
    if (reduced) return { opacity: u < 0.8 ? 1 : 1 - (u - 0.8) / 0.2, scale: 1, rot: -3 };
    let i = 0;
    while (i < POP_KEYS.length - 2 && u > POP_KEYS[i + 1][0]) i++;
    const a = POP_KEYS[i];
    const b = POP_KEYS[i + 1];
    const k = easeOut(clamp01((u - a[0]) / (b[0] - a[0])));
    return { opacity: lerp(a[1], b[1], k), scale: lerp(a[2], b[2], k), rot: lerp(a[3], b[3], k) };
  };

  return {
    letterbox(onMs, offMs) {
      bar = { onMs, offMs };
    },
    speedLines(onMs, offMs) {
      lines = { onMs, offMs };
    },
    skipHint(onMs, offMs) {
      hint = { onMs, offMs };
    },
    flash(atMs) {
      flashAt = atMs;
    },
    pop(text, atMs, small = false, line = 0) {
      popping[line] = { text, small, atMs };
    },
    distance(metres, onMs, offMs) {
      distSpan = { metres, onMs, offMs };
    },
    clear() {
      bar = lines = hint = distSpan = null;
      popping = [null, null];
      flashAt = -Infinity;
    },
    render(now, reduced) {
      const b = smooth(fade(bar, now, LOOK.letterboxMs));
      for (const el of bars) el.style.height = `${(8 * b).toFixed(2)}vh`;

      const s = fade(lines, now, LOOK.speedFadeMs);
      speed.style.opacity = s.toFixed(3);
      speed.style.transform = s > 0 && !reduced ? `rotate(${(((now / 1000) * LOOK.speedSpinDegPerS) % 6).toFixed(2)}deg)` : '';

      const f = reduced ? 0 : clamp01(1 - (now - flashAt) / LOOK.flashMs);
      flashEl.style.opacity = now >= flashAt ? (LOOK.flashPeak * easeOut(f)).toFixed(3) : '0';

      popEls.forEach((el, i) => {
        const pop = popping[i];
        const pu = pop ? (now - pop.atMs) / LOOK.popMs : -1;
        if (!pop || pu < 0 || pu >= 1) {
          el.style.opacity = '0';
          return;
        }
        if (shownText[i] !== pop.text) el.textContent = shownText[i] = pop.text;
        el.classList.toggle('small', pop.small);
        const p = popStyle(pu, reduced);
        el.style.opacity = p.opacity.toFixed(3);
        el.style.transform = `scale(${p.scale.toFixed(3)}) rotate(${p.rot.toFixed(2)}deg)`;
      });

      const d = fade(distSpan, now, LOOK.distanceFadeMs);
      dist.style.opacity = d.toFixed(3);
      dist.style.transform = `translateY(${(10 * (1 - d)).toFixed(1)}px)`;
      if (distSpan && d > 0) {
        const m = Math.round(distSpan.metres * easeOut(clamp01((now - distSpan.onMs) / LOOK.distanceCountMs)));
        if (m !== shownMetres) distN.textContent = String((shownMetres = m));
      }

      skip.style.opacity = fade(hint, now, 200).toFixed(3);
    },
  };
}
