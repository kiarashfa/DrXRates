// Dr. X's still frames: the gallery index published by the DrXMedia repo
// (its stills.json; format in that repo's README) is copied into
// data/generated/stills.json, keeping only films that exist here. Without a
// ../DrXMedia checkout next to this repo (CI, another machine) the committed
// copy is left as it is.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const SOURCE = path.resolve('../DrXMedia/stills.json');

export async function importStills(movieIds, outFile) {
  let src = null;
  try {
    src = JSON.parse(await readFile(SOURCE, 'utf8'));
  } catch {
    /* no DrXMedia checkout: keep the committed file */
  }
  const unknown = [];
  if (src) {
    const films = {};
    for (const [id, film] of Object.entries(src.films)) {
      if (movieIds.has(Number(id))) films[id] = film;
      else unknown.push(id);
    }
    await writeFile(outFile, JSON.stringify({ updated: src.updated, films }), 'utf8');
  }
  const current = JSON.parse(await readFile(outFile, 'utf8').catch(() => '{"films":{}}'));
  const films = Object.values(current.films);
  return {
    imported: !!src,
    films: films.length,
    frames: films.reduce((n, f) => n + f.frames.length, 0),
    unknown,
  };
}
