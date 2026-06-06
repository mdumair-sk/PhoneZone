import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Use happy-dom for frontend tests (DOM simulation)
    environment: 'happy-dom',
    // Setup files run before each test file
    setupFiles: ['./tests/setup.js'],
    // Include test files
    include: ['tests/**/*.test.js'],
    // Timeout
    testTimeout: 10000,
    // Global test APIs (describe, it, expect)
    globals: true,
  },
});
