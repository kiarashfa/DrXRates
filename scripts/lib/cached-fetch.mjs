import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Generic cached JSON GET used by the OMDb and Wikipedia helpers.
// The cacheKey (not the URL) names the cache file so API keys never land on disk.
export async function cachedJson(url, { cacheDir, cacheKey, headers = {}, offline = false, shouldCache = () => true }) {
  const hash = createHash('sha1').update(cacheKey ?? url).digest('hex');
  const file = path.join(cacheDir, `${hash}.json`);
  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    return { data: cached.data, fromCache: true };
  } catch {
    // cache miss
  }
  if (offline) return { data: null, fromCache: false };

  let data = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) {
        // APIs like OMDb return their real error as a JSON body on 4xx
        // (e.g. 401 'Request limit reached!') — surface it, don't retry it.
        let body = null;
        try {
          body = await res.json();
        } catch {}
        if (body && typeof body === 'object') {
          data = { ...body, __httpStatus: res.status };
          break;
        }
        if (res.status === 404) {
          data = { __notFound: true };
          break;
        }
        throw new Error(`HTTP ${res.status}`);
      }
      data = await res.json();
      break;
    } catch (err) {
      if (attempt === 3) return { data: null, fromCache: false, error: err.message };
      await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
    }
  }
  if (data != null && shouldCache(data)) {
    await mkdir(cacheDir, { recursive: true });
    await writeFile(file, JSON.stringify({ cacheKey: cacheKey ?? url, fetchedAt: new Date().toISOString(), data }), 'utf8');
  }
  return { data, fromCache: false };
}
