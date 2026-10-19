// Poster shards: /data/posters/<n>.json holds { [id]: poster } for films whose
// id % POSTER_SHARDS === n, so a few cards cost a few KB, not the full file.
import type { APIRoute } from 'astro';
import { POSTER_SHARDS, posterShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: POSTER_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(posterShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
