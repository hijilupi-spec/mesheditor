import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/integration/**/*.test.ts'],
    globals: true,
    testTimeout: 45000,
    hookTimeout: 45000,
  },
});

