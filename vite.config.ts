import { defineConfig } from 'vitest/config';
import { pwa } from './src/pwa/plugin';

// GitHub Pages serves the site at https://justingu1110.github.io/homerun-derby/
export default defineConfig({
  base: '/homerun-derby/',
  // 加入主畫面: manifest, generated icons and iOS tags.
  plugins: [pwa()],
  // three.js alone is ~500 kB minified; that's expected for this game.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
