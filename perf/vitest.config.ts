import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
// Separate from the quality suite: run with `npx vitest run --config perf/vitest.config.ts`.
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('../src', import.meta.url)) } }, test: { include: ['perf/**/*.bench.test.ts'], environment: 'node', testTimeout: 120_000 } });
