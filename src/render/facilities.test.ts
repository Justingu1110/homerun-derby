import { Points, Scene, Vector3, type Material, type Object3D } from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { FACILITIES, type Landing } from '../core';
import { createFacilityView } from './facilities';

// The facility models draw their signs on a 2D canvas; in node there is no DOM, so
// give them a canvas whose context accepts any drawing call.
beforeAll(() => {
  const ctx: object = new Proxy(
    {},
    {
      get: (_, key) =>
        key === 'measureText' ? () => ({ width: 10 }) : key === 'createRadialGradient' || key === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {},
      set: () => true,
    },
  );
  Object.assign(globalThis, { document: { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) } });
});

const scoreboard = FACILITIES.find((f) => f.id === 'scoreboard')!;
const hit: Landing = { kind: 'facility', facility: scoreboard, smashed: false };
const ball = { distance: 150, angle: 0 };
const toward = new Vector3(0, 0, -1);

const objectsIn = (scene: Scene) => {
  let n = 0;
  scene.traverse(() => n++);
  return n;
};

describe('FacilityView: impact effects do not pile up within a round', () => {
  it('sparks from a hit are removed and disposed once they have played', () => {
    const scene = new Scene();
    const view = createFacilityView(scene);
    view.sync(['scoreboard']); // a round that has already 打碎 something keeps its shards
    const before = new Set<Object3D>(scene.children);

    view.impact(ball, hit, 1000, toward);
    const sparks = scene.children.find((o) => !before.has(o));
    expect(sparks).toBeInstanceOf(Points);
    let disposed = 0;
    (sparks as Points).geometry.addEventListener('dispose', () => disposed++);
    ((sparks as Points).material as Material).addEventListener('dispose', () => disposed++);

    view.update(1000 + 5000);
    expect(scene.children).not.toContain(sparks);
    expect(disposed).toBe(2);
  });

  it('many hits on a facility in one round leave the scene the same size', () => {
    const scene = new Scene();
    const view = createFacilityView(scene);
    view.sync(['scoreboard']);
    const size = objectsIn(scene);
    for (let i = 0; i < 40; i++) {
      const at = 1000 + i * 8000;
      view.impact(ball, hit, at, toward);
      view.update(at + 6000);
    }
    expect(objectsIn(scene)).toBe(size);
  });
});

describe('FacilityView: a home run into the stands ends on the seat row it lands in', () => {
  it('a 132 m home run at −9.9° rests on the 9th row (11 m up), not inside the steps', () => {
    const view = createFacilityView(new Scene());
    const p = view.impactPoint({ distance: 132, angle: -9.9 }, { kind: 'stands' });
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(132, 5);
    expect(p.y).toBeCloseTo(11 + 0.13, 5);
  });
});
