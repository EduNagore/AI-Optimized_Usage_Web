import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4321/AI-Optimized_Usage_Web/' },
  webServer: {
    command: 'npm run build && npm run preview',
    url: 'http://localhost:4321/AI-Optimized_Usage_Web/',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
