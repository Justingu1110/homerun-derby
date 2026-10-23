import { PerspectiveCamera, Scene, WebGLRenderer } from 'three';

/** Default camera: behind and slightly above the batter, looking out at the pitcher's mound. */
export const BATTER_VIEW = {
  position: [0.35, 2.3, 5.6],
  lookAt: [-0.15, 0.9, -18],
} as const;

const MAX_PIXEL_RATIO = 2;

export interface View {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  /** Starts the render loop; `update` gets elapsed seconds since the previous frame. */
  start(update?: (dt: number) => void): void;
}

/** Full-screen renderer + camera that refits itself on resize and rotation. */
export function createView(canvas: HTMLCanvasElement): View {
  const renderer = new WebGLRenderer({ canvas, antialias: true });
  const scene = new Scene();
  const camera = new PerspectiveCamera(60, 1, 0.1, 1500);
  camera.position.set(...BATTER_VIEW.position);
  camera.lookAt(...BATTER_VIEW.lookAt);

  const fit = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Portrait needs a taller vertical FOV to keep the outfield wall in frame.
    camera.fov = w < h ? 64 : 48;
    camera.updateProjectionMatrix();
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
        const dt = Math.min((now - last) / 1000, 0.1);
        last = now;
        update?.(dt);
        renderer.render(scene, camera);
      });
    },
  };
}
