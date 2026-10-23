import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site at https://justingu1110.github.io/homerun-derby/
export default defineConfig({
  base: '/homerun-derby/',
  // three.js alone is ~500 kB minified; that's expected for this game.
  build: { chunkSizeWarningLimit: 800 },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
