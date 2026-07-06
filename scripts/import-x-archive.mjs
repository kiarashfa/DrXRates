// TODO — X (Twitter) archive still-frame import. Not yet implemented; waiting on
// the user's X data export ("download an archive of your data" zip).
//
// Planned behavior once the archive is provided:
//  1. Read tweets from the archive (data/tweets.js or tweets/*.js inside the export,
//     each entry has full_text, entities.hashtags, and extended_entities.media).
//  2. Group posts by their per-movie hashtag. Known quirks to handle:
//     - Hashtags use the personal prefix seen in Rating_DB.xlsx column 31 (e.g. '#DrX_').
//     - Long movie titles were SHORTENED in their hashtag — exact title slugs won't
//       always match; needs fuzzy matching against Rating_DB titles + a review file
//       for unresolved hashtags (same pattern as data/review/match-review.md).
//     - Different movies can share one hashtag (same title, e.g. remakes) — those
//       need year disambiguation from tweet text/date, or manual override entries.
//  3. Copy matched media files into public/stills/<tmdbMovieId>/NNN.jpg.
//  4. Write the stills index so build-data.mjs can attach `stills: [...]` to each
//     movie record (build-data currently emits an empty array as the hook).
//  5. Emit data/review/stills-review.md for anything ambiguous — never guess silently.
//
// Manual overrides will live in data/stills-overrides.json, mirroring overrides.json.

console.error('import-x-archive: not implemented yet — provide the X data export first (see TODO notes in this file).');
process.exit(1);
