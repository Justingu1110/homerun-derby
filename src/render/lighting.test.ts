import { DirectionalLight, Mesh, MeshLambertMaterial, PlaneGeometry, Scene, type Object3D, type WebGLRenderer } from 'three';
import { describe, expect, it } from 'vitest';
import { buildCrowd } from './crowd';
import { enablePlayerShadows } from './lighting';

const fakeRenderer = () => ({ shadowMap: { enabled: false, type: 0 } }) as unknown as WebGLRenderer;

const meshesIn = (root: Object3D) => {
  const found: Mesh[] = [];
  root.traverse((o) => {
    if ((o as Mesh).isMesh) found.push(o as Mesh);
  });
  return found;
};

describe('player shadows', () => {
  it('fall on the field but not on the crowd, which sits outside the shadow area', () => {
    const scene = new Scene();
    const sun = new DirectionalLight();
    sun.name = 'sun';
    sun.position.set(10, 30, 10);
    const ground = new Mesh(new PlaneGeometry(10, 10), new MeshLambertMaterial());
    const crowd = buildCrowd();
    scene.add(sun, ground, crowd);

    enablePlayerShadows(fakeRenderer(), scene);

    expect(ground.receiveShadow).toBe(true);
    const fans = meshesIn(crowd);
    expect(fans.length).toBeGreaterThan(0);
    expect(fans.filter((m) => m.receiveShadow || m.castShadow)).toEqual([]);
  });
});
