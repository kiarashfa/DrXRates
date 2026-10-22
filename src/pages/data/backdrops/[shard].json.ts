// Backdrop shards: /data/backdrops/<n>.json holds { [id]: backdrop } for films whose
// id % BACKDROP_SHARDS === n (see client-data.js).
import type { APIRoute } from 'astro';
import { BACKDROP_SHARDS, backdropShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: BACKDROP_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(backdropShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
