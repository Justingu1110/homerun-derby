import { seededRandom, toWorld } from './coords';
import { STAND_ROWS } from './stands';

/**
 * Who sits where in the stands, and which level of detail a patch of the crowd
 * is drawn with. Plain data, so it is testable without WebGL; crowd.ts turns it
 * into instanced meshes.
 */
export const CROWD = {
  /** Metres between neighbouring seats along a row. */
  spacing: 1,
  /** Share of seats left empty. */
  empty: 0.2,
  /** Share of fans wearing a cap (the rest show their hair). */
  hat: 0.55,
  /** Share of fans waving a cheer towel. */
  towel: 0.15,
  /** The stands are cut into this many wedges (one LOD switch and one cull test each). */
  wedges: 13,
  /** A wedge is drawn with full detail while the camera is within this many metres of it. */
  nearM: 30,
} as const;

const PALETTE = {
  shirts: ['#1f2a6b', '#ffffff', '#d6322b', '#ffc83d', '#2f78d8', '#f08bd0', '#1f8a5b', '#ff7a1a', '#111111', '#9b59d0', '#e8e8e8'],
  skins: ['#ffd6b0', '#f5c79e', '#e8b48a', '#c98f66', '#ffe0c4'],
  hats: ['#1f2a6b', '#d6322b', '#ffffff', '#ffc83d', '#111111', '#2f78d8'],
  hairs: ['#2a1d16', '#111111', '#5a3a22', '#c9a04a', '#8a8a8a'],
} as const;

export interface Fan {
  /** World position of the seat (on the row's tread). */
  position: [number, number, number];
  /** Yaw (rad) that turns the fan's local +z toward home plate. */
  facing: number;
  row: number;
  /** Cheer / sway phase, rad. */
  phase: number;
  /** Body size, around 1. */
  scale: number;
  shirt: string;
  skin: string;
  /** Cap colour, or null: no cap, the hair shows. */
  hat: string | null;
  hair: string;
  towel: boolean;
}

/** A wedge of the stands: its fans and a sphere that holds all of them. */
export interface CrowdChunk {
  center: [number, number, number];
  radius: number;
  fans: Fan[];
}

export type CrowdLevel = 'near' | 'far';

const pick = <T>(rand: () => number, list: readonly T[]) => list[Math.floor(rand() * list.length)];

/** Seats the crowd along STAND_ROWS (seeded, so the stands look the same every load) and groups it into wedges. */
export function layoutCrowd(seed = 1110): CrowdChunk[] {
  const rand = seededRandom(seed);
  const { fromDeg, toDeg } = STAND_ROWS[0];
  const wedgeDeg = (toDeg - fromDeg) / CROWD.wedges;
  const wedges: Fan[][] = Array.from({ length: CROWD.wedges }, () => []);
  const at = { x: 0, y: 0, z: 0 } as { x: number; y: number; z: number };
  for (const row of STAND_ROWS) {
    const step = ((CROWD.spacing / row.seatRadius) * 180) / Math.PI;
    for (let angle = row.fromDeg + step / 2; angle < row.toDeg; angle += step) {
      if (rand() < CROWD.empty) continue;
      const a = angle + (rand() - 0.5) * step * 0.16;
      const r = row.seatRadius + (rand() - 0.5) * 0.16;
      const p = toWorld(a, r, row.height);
      Object.assign(at, p);
      const hatted = rand() < CROWD.hat;
      wedges[Math.min(CROWD.wedges - 1, Math.floor((a - fromDeg) / wedgeDeg))].push({
        position: [at.x, at.y, at.z],
        facing: Math.atan2(-at.x, -at.z),
        row: row.index,
        phase: rand() * Math.PI * 2,
        scale: 0.9 + rand() * 0.22,
        shirt: pick(rand, PALETTE.shirts),
        skin: pick(rand, PALETTE.skins),
        hat: hatted ? pick(rand, PALETTE.hats) : null,
        hair: pick(rand, PALETTE.hairs),
        towel: rand() < CROWD.towel,
      });
    }
  }
  return wedges.map((fans) => {
    const lo = [Infinity, Infinity, Infinity];
    const hi = [-Infinity, -Infinity, -Infinity];
    for (const f of fans) for (let k = 0; k < 3; k++) (lo[k] = Math.min(lo[k], f.position[k])), (hi[k] = Math.max(hi[k], f.position[k]));
    const center = [0, 1, 2].map((k) => (lo[k] + hi[k]) / 2) as [number, number, number];
    let radius = 0;
    for (const f of fans) radius = Math.max(radius, Math.hypot(f.position[0] - center[0], f.position[1] - center[1], f.position[2] - center[2]));
    return { center, radius, fans };
  });
}

/** Full detail while the camera is within CROWD.nearM of the wedge, the simple shape beyond. */
export function crowdLevel(chunk: CrowdChunk, camera: { x: number; y: number; z: number }): CrowdLevel {
  const [x, y, z] = chunk.center;
  const gap = Math.hypot(camera.x - x, camera.y - y, camera.z - z) - chunk.radius;
  return gap <= CROWD.nearM ? 'near' : 'far';
}
