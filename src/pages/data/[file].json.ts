// Static JSON for the browser, one file per entry in CLIENT_FILES
// (src/lib/client-data.js), written to dist/data/<file>.json at build time.
import type { APIRoute } from 'astro';
import { CLIENT_FILES } from '../../lib/client-data.js';

export function getStaticPaths() {
  return Object.keys(CLIENT_FILES).map((file) => ({ params: { file } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(CLIENT_FILES[params.file as keyof typeof CLIENT_FILES]()), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
