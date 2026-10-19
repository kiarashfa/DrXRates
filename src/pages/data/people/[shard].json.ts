// People shards: /data/people/<n>.json maps person id → [name, profile] for
// people whose id % PEOPLE_SHARDS === n (see peopleShard in client-data.js).
import type { APIRoute } from 'astro';
import { PEOPLE_SHARDS, peopleShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: PEOPLE_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(peopleShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
