import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { createPixelRatioGovernor, wantsAntialias } from './pixelRatio';

/**
 * 打擊視角: close behind the batter, who fills the lower left foreground, with
 * the pitcher in the middle of the screen. A narrow lens (vertical fov, degrees)
 * makes the pitcher look bigger.
 */
export const BATTER_VIEW = {
  position: [0.05, 1.7, 4.6],
  lookAt: [0.1, 0.15, -18],
  fov: 44,
} as const;

/** The wide lens for everything else (the 全壘打演出): portrait needs a taller fov to keep the wall in frame. */
const wideFov = (aspect: number) => (aspect < 1 ? 64 : 48);
const lensBlend = new WeakMap<PerspectiveCamera, number>();

/**
 * Sets the lens: 0 = wide, 1 = the batter view's narrow lens, in between blends
 * (the camera coming back to the batter). Survives resizes.
 */
export function setLens(camera: PerspectiveCamera, batter: number): void {
  lensBlend.set(camera, batter);
  camera.fov = wideFov(camera.aspect) + (BATTER_VIEW.fov - wideFov(camera.aspect)) * batter;
  camera.updateProjectionMatrix();
}

export interface View {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Starts the render loop; `update` gets elapsed seconds since the previous frame. */
  start(update?: (dt: number) => void): void;
}

/** Full-screen renderer + camera that refits itself on resize and rotation. */
export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new WebGLRenderer({ canvas, antialias: wantsAntialias(window.devicePixelRatio) });
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 1500);
  const pixelRatio = createPixelRatioGovernor(window.devicePixelRatio);
  camera.position.set(...BATTER_VIEW.position);
  camera.lookAt(...BATTER_VIEW.lookAt);

  const fit = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(pixelRatio.ratio());
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    setLens(camera, lensBlend.get(camera) ?? 1);
  };
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);
  window.visualViewport?.addEventListener('resize', fit);

  return {
    renderer,
    scene,
    camera,
    start(update) {
      let last = performance.now();
      renderer.setAnimationLoop((now) => {
        // A phone that can't keep up renders fewer pixels from the next frame on.
        if (pixelRatio.frame(now - last) !== null) fit();
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        update?.(dt);
        renderer.render(scene, camera);
      });
    },
  };
}
