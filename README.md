# The Cinema Ledger

A personal film archive and rating system. Every film I watch is scored out of ten — five points of **content** (originality, character, continuity, suspense, meaning) and five of **form** (acting, cinematography, sound, directing, production design). The site holds 10,000+ films, 1,200+ of them personally rated, alongside curated collections, director hall-of-fame pages with average-shot-length data, and scores from TMDB, IMDb, Rotten Tomatoes, and Metacritic.

Visitors can rate any film with the same ten-part system — ratings stay in your own browser (nothing is uploaded), with JSON export/import to move them between machines.

Fully static: Astro + Svelte, no backend, three themes (light / dark / matrix).

## Running locally

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # production build to dist/
npm run preview    # serve the production build
```

The site builds entirely from the JSON in `data/generated/` — no API keys needed to build or deploy.

## Updating the data

Ratings live in `Rating_DB.xlsx`, shot-length data in `ASL_DB.xlsx`. To regenerate the site data after editing:

1. Copy `.env.example` to `.env` and add a [TMDB API token](https://developer.themoviedb.org/) (and optionally an [OMDb key](https://www.omdbapi.com/apikey.aspx)).
2. `npm run data` — parses the spreadsheets, matches films against TMDB, and rewrites `data/generated/`. Anything ambiguous is logged for manual review rather than guessed; fixes go in `data/overrides.json`.
3. `npm run omdb` — optional daily top-up of IMDb/Rotten Tomatoes/Metacritic scores (OMDb's free tier allows ~1,000 requests per day).

Collections (director filmographies, franchises, custom lists) are defined in `data/collections.config.json` — edit and re-run `npm run data`.

## Deploying

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every push to `main`. One-time setup: in the repo settings, set Pages → Source to **GitHub Actions** — nothing else. The workflow detects the site URL and base path automatically, whether the repo is a user site (`<user>.github.io`) or a project site (`https://<user>.github.io/<repo>/`), and needs no secrets.

## Credits

Film metadata and posters from [TMDB](https://www.themoviedb.org/) — this product uses the TMDB API but is not endorsed or certified by TMDB. Supplementary ratings via the [OMDb API](https://www.omdbapi.com/). Director portraits from TMDB and Wikimedia Commons.
