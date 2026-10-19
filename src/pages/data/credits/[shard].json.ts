// Credit shards: /data/credits/<n>.json holds the role-coded person ids of
// films whose id % CREDIT_SHARDS === n (see creditShard in client-data.js).
import type { APIRoute } from 'astro';
import { CREDIT_SHARDS, creditShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: CREDIT_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(creditShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
