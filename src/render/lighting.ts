import { DirectionalLight, MeshBasicMaterial, PCFShadowMap, type Mesh, type Object3D, type Scene, type WebGLRenderer } from 'three';
import { FIELD } from '../core';

/**
 * Soft shadows for the players (ADR 0002): the scene's sun casts them, and only
 * over home plate to the mound, so one small shadow map is enough on a phone.
 * Call once everything is in the scene: whatever casts a shadow (the players,
 * the bat) keeps casting, and every other lit mesh receives, except under an
 * object marked with `outsideShadows` (the crowd, far beyond the shadow area).
 */
/** Marks a subtree that never sees the players' shadows, so its meshes skip the shadow pass. */
export function outsideShadows(o: Object3D): void {
  o.userData.outsideShadows = true;
}

export function enablePlayerShadows(renderer: WebGLRenderer, scene: Scene): void {
  // The stadium names its sun 'sun' (#16); fall back to the first directional light.
  const named = scene.getObjectByName('sun');
  let sun: DirectionalLight | null = named instanceof DirectionalLight ? named : null;
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

  const receive = (o: Object3D) => {
    if (o.userData.outsideShadows) return;
    const m = o as Mesh;
    if (m.isMesh && !m.castShadow) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      if (mats.every((mat) => !(mat instanceof MeshBasicMaterial))) m.receiveShadow = true;
    }
    o.children.forEach(receive);
  };
  receive(scene);
}
