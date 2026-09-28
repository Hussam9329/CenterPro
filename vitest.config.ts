import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';
export default defineConfig({ resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }, test: { include: ['tests/domain/**/*.test.ts','tests/integration/**/*.test.ts'], environment: 'node' } });
