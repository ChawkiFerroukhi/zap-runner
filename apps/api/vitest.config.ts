import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    hookTimeout: 60_000,
    testTimeout: 20_000,
  },
});
