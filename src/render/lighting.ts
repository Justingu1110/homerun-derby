import { DirectionalLight, MeshBasicMaterial, PCFShadowMap, type Mesh, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { FIELD } from '../core';

/**
 * Soft shadows for the players (ADR 0002): the scene's sun casts them, and only
 * over home plate to the mound, so one small shadow map is enough on a phone.
 * Call once everything is in the scene: whatever casts a shadow (the players,
 * the bat) keeps casting, and every other lit mesh receives.
 */
export function enablePlayerShadows(renderer: WebGLRenderer, scene: Scene): void {
  let sun: DirectionalLight | null = null;
  scene.traverse((o) => {
    if (!sun && o instanceof DirectionalLight) sun = o;
  });
  if (!sun) return;
  const light: DirectionalLight = sun;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;

  // Aim at the middle of home → mound and fit the shadow camera round it (light space, metres).
  const mid = -FIELD.moundDistance / 2;
  light.target.position.set(0, 0, mid);
  scene.add(light.target);
  light.castShadow = true;
  const half = FIELD.moundDistance / 2 + 3;
  Object.assign(light.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: light.position.length() * 2 });
  light.shadow.camera.updateProjectionMatrix();
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.bias = -0.0006;
  light.shadow.normalBias = 0.02;

  scene.traverse((o: Object3D) => {
    const m = o as Mesh;
    if (!m.isMesh || m.castShadow) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.every((mat) => !(mat instanceof MeshBasicMaterial))) m.receiveShadow = true;
  });
}
