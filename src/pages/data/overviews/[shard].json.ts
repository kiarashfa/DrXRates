// Synopsis shards: /data/overviews/<n>.json holds { [id]: text } for films whose
// id % OVERVIEW_SHARDS === n (see overviewShard in client-data.js).
import type { APIRoute } from 'astro';
import { OVERVIEW_SHARDS, overviewShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: OVERVIEW_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(overviewShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
