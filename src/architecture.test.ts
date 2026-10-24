import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Architecture guard: the game core (src/core) is pure rules, testable without a
// browser. It may only import its own modules — never three.js, the renderer or
// the DOM — plus vitest in its tests. (DOM globals are also blocked by
// tsconfig.core.json.)
const CORE_DIR = fileURLToPath(new URL('./core', import.meta.url));
const APP_DIR = fileURLToPath(new URL('./app', import.meta.url));
const RENDER_DIR = fileURLToPath(new URL('./render', import.meta.url));
const IMPORT_RE = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(?\s*['"]([^'"]+)['"]/g;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith('.ts') ? [join(dir, e.name)] : [],
  );
}

describe('game core', () => {
  it('imports nothing outside src/core', () => {
    const offenders: string[] = [];
    for (const file of sources(CORE_DIR)) {
      const isTest = file.endsWith('.test.ts');
      for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        const local = spec.startsWith('./') || (spec.startsWith('../') && join(file, '..', spec).startsWith(CORE_DIR));
        if (!local && !(isTest && spec === 'vitest')) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});

// The app screens (src/app) are DOM only; the three.js render layer is wired in by
// main.ts. Words both need (飛距離, 難度倍率, 球種) live in src/presentation.
describe('app screens', () => {
  it('import nothing from src/render', () => {
    const offenders: string[] = [];
    for (const file of sources(APP_DIR)) {
      for (const m of readFileSync(file, 'utf8').matchAll(IMPORT_RE)) {
        const spec = m[1] ?? m[2];
        if (join(file, '..', spec).startsWith(RENDER_DIR)) offenders.push(`${file}: ${spec}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
