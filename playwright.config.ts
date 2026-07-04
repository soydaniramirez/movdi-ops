import { defineConfig } from '@playwright/test'

// e2e de auth contra un mock local de Supabase (el sandbox no tiene red
// a *.supabase.co). Ver e2e/mock-supabase.mjs.
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // El mock comparte estado entre tests (reset en beforeEach): secuencial.
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    // Chromium preinstalado del entorno; en local puedes quitar executablePath
    // (o correr `npx playwright install chromium`).
    launchOptions: process.env.PLAYWRIGHT_BROWSERS_PATH
      ? { executablePath: `${process.env.PLAYWRIGHT_BROWSERS_PATH}/chromium` }
      : {},
  },
  webServer: [
    {
      command: 'node e2e/mock-supabase.mjs',
      port: 54321,
      reuseExistingServer: true,
    },
    {
      // Build de producción (sin HMR): el dev server hace full-reloads en
      // sandboxes sin websockets y rompe la interacción de las pruebas.
      // Las env se pasan también a start: el código de servidor las lee en runtime.
      command:
        'NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test npm run build && NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321 NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_test SUPABASE_SERVICE_ROLE_KEY=sb_secret_test npm run start -- -p 3100',
      port: 3100,
      reuseExistingServer: false,
      timeout: 240_000,
    },
  ],
})
