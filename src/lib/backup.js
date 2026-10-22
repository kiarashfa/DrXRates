// One backup file for everything a visitor keeps in this browser. Each
// section maps a top-level key of the file to a store: `read` returns what to
// export, `merge` folds an imported value in and returns { imported, skipped }.
// Files from before sections existed ({ version: 1, ratings }) are the same
// shape minus the header, so they import unchanged; older site code reads
// only `ratings` from newer files.
import { loadStore, mergeRatings } from './visitor.js';
import { watchlistItems, mergeWatchlist } from './watchlist.js';
import { knockoutStore, mergeKnockout } from './knockout-store.js';
import { frameStore, mergeFrames } from './frame-store.js';

const SECTIONS = {
  ratings: {
    read: () => loadStore().ratings,
    merge: (value) => mergeRatings(value),
  },
  watchlist: {
    read: () => watchlistItems(),
    merge: (value) => mergeWatchlist(value),
  },
  knockout: {
    read: () => knockoutStore(),
    merge: (value) => mergeKnockout(value),
  },
  frames: {
    read: () => frameStore(),
    merge: (value) => mergeFrames(value),
  },
};

export function exportBackup() {
  const data = { app: 'cinema-ledger', version: 2, exportedAt: new Date().toISOString() };
  for (const [name, section] of Object.entries(SECTIONS)) data[name] = section.read();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cinema-ledger-backup-${data.exportedAt.slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Merges a backup file in. Returns { sections: { [name]: { imported, skipped } } }
// for every section the file contained.
export async function importBackupFile(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  const present = Object.keys(SECTIONS).filter((name) => parsed?.[name] && typeof parsed[name] === 'object');
  if (!present.length) {
    throw new Error('Not a Cinema Ledger backup: no ratings or other saved data found.');
  }
  const sections = {};
  for (const name of present) sections[name] = SECTIONS[name].merge(parsed[name]);
  return { sections };
}
