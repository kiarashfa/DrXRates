// Card shards: /data/cards/<n>.json holds card rows for films whose
// id % CARD_SHARDS === n (see cardShard in client-data.js).
import type { APIRoute } from 'astro';
import { CARD_SHARDS, cardShard } from '../../../lib/client-data.js';

export function getStaticPaths() {
  return Array.from({ length: CARD_SHARDS }, (_, shard) => ({ params: { shard: String(shard) } }));
}

export const GET: APIRoute = ({ params }) =>
  new Response(JSON.stringify(cardShard(Number(params.shard))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
