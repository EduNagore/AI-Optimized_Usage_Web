// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import react from '@astrojs/react';
import { modules } from './src/lib/modules.ts';

// GitHub Pages de proyecto: https://edunagore.github.io/AI-Optimized_Usage_Web/
export default defineConfig({
  devToolbar: { enabled: false },
  site: 'https://edunagore.github.io',
  base: '/AI-Optimized_Usage_Web',
  vite: {
    build: {
      rollupOptions: {
        // Astro inserta la directiva "use astro:head-inject" en cada módulo de contenido y el empaquetador
        // avisa de que no puede conservarla. Es ruido interno de Astro, no un problema del proyecto.
        onwarn(warning, warn) {
          if (warning.code === 'MODULE_LEVEL_DIRECTIVE') return;
          warn(warning);
        },
      },
    },
  },
  integrations: [
    starlight({
      title: 'Usa la IA como un profesional',
      description:
        'Guía en español para usar Claude, GPT y Gemini en el trabajo: método, prompting, modelo y esfuerzo, tokens y agentes, con datos verificados y fechados.',
      defaultLocale: 'root',
      locales: { root: { label: 'Español', lang: 'es' } },
      customCss: ['./src/styles/fonts.css', './src/styles/tokens.css', './src/styles/theme.css'],
      components: {
        PageTitle: './src/components/overrides/PageTitle.astro',
        Footer: './src/components/overrides/Footer.astro',
      },
      pagination: true,
      tableOfContents: { minHeadingLevel: 2, maxHeadingLevel: 3 },
      sidebar: modules.map((m) => ({
        label: m.label,
        collapsed: true,
        items: [{ autogenerate: { directory: m.dir } }],
      })),
    }),
    react(),
  ],
});
