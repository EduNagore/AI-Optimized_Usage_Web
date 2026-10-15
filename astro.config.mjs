// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';

// GitHub Pages de proyecto: https://edunagore.github.io/AI-Optimized_Usage_Web/
export default defineConfig({
  site: 'https://edunagore.github.io',
  base: '/AI-Optimized_Usage_Web',
  integrations: [
    starlight({
      title: 'Usa la IA como un profesional',
      defaultLocale: 'root',
      locales: { root: { label: 'Español', lang: 'es' } },
      sidebar: [{ label: 'Prueba', items: [{ autogenerate: { directory: 'prueba' } }] }],
    }),
    react(),
  ],
});
