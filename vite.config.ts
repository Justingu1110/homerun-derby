import { defineConfig } from 'vitest/config';

// GitHub Pages serves the site at https://justingu1110.github.io/homerun-derby/
export default defineConfig({
  base: '/homerun-derby/',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
