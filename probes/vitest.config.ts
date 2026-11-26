import { defineConfig } from 'vitest/config';

/** Slow measurement probes, kept out of `npm test`: `npx vitest run -c probes/vitest.config.ts`. */
export default defineConfig({ test: { include: ['probes/**/*.test.ts'], environment: 'node', testTimeout: 600_000 } });
