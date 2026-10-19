import type { APIRoute, GetStaticPaths } from 'astro';

/** Publica cada plantilla de src/content/plantillas/ como fichero Markdown descargable. */
const files = import.meta.glob('/src/content/plantillas/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
});

export const getStaticPaths = (() =>
  Object.entries(files).map(([path, body]) => ({
    params: { slug: path.split('/').pop()!.replace(/\.md$/, '') },
    props: { body: body as string },
  }))) satisfies GetStaticPaths;

export const GET: APIRoute = ({ props }) =>
  new Response(props.body as string, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
