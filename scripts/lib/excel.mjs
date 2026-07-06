import ExcelJS from 'exceljs';
import { CONTENT_KEYS, FORM_KEYS, computeTotals } from '../../shared/rating-meta.mjs';

// Rating_DB.xlsx 'Ratings' sheet: interleaved separator columns.
// 1-indexed data columns (see memory/docs): 2=Name, 3='[Year]',
// content subs at 5,7,9,11,13 -> avg 15; form subs at 17,19,21,23,25 -> avg 27;
// 29=overall, 31=hashtag prefix, 32=FRate, 33=plain year.
const SUB_COLS = [5, 7, 9, 11, 13, 17, 19, 21, 23, 25];
const SUB_KEYS = [...CONTENT_KEYS, ...FORM_KEYS].map((k) => k.key);

function cellVal(row, col) {
  const v = row.getCell(col).value;
  if (v == null) return null;
  if (v instanceof Date) {
    // Titles like '2:22' get stored by Excel as time values (1899-12-31T02:22Z).
    return `${v.getUTCHours()}:${String(v.getUTCMinutes()).padStart(2, '0')}`;
  }
  if (typeof v === 'object') {
    if ('result' in v) return v.result ?? null;
    if ('richText' in v) return v.richText.map((r) => r.text).join('');
    if ('text' in v) return v.text;
    return null;
  }
  return v;
}

function asNumber(v) {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number(v.trim());
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

function asString(v) {
  return v == null ? null : String(v).trim();
}

export async function parseRatings(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Ratings');
  if (!ws) throw new Error(`Sheet 'Ratings' not found in ${path}`);

  const movies = [];
  const warnings = [];
  const seen = new Map();

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const title = asString(cellVal(row, 2));
    if (!title) return;

    const scores = {};
    let missing = 0;
    SUB_COLS.forEach((col, i) => {
      const n = asNumber(cellVal(row, col));
      if (n == null || n < 0 || n > 5) missing++;
      else scores[SUB_KEYS[i]] = n;
    });
    if (missing === SUB_COLS.length) {
      // Summary rows like 'Rated Movies Count' have a name but no scores.
      return;
    }

    let year = asNumber(cellVal(row, 33));
    if (year == null) {
      const bracket = asString(cellVal(row, 3));
      if (bracket) year = asNumber(bracket.replace(/[[\]]/g, ''));
    }
    if (year == null || year < 1880 || year > 2100) {
      warnings.push({ row: rowNumber, title, kind: 'bad-year', detail: String(cellVal(row, 3)) });
    }

    if (missing > 0) {
      warnings.push({ row: rowNumber, title, kind: 'missing-subscores', detail: `${missing} of 10 sub-scores unreadable` });
      return;
    }

    const totals = computeTotals(scores);
    const sheetContent = asNumber(cellVal(row, 15));
    const sheetForm = asNumber(cellVal(row, 27));
    const sheetOverall = asNumber(cellVal(row, 29));
    for (const [label, mine, sheet] of [
      ['content avg', totals.contentAvg, sheetContent],
      ['form avg', totals.formAvg, sheetForm],
      ['overall', totals.overall, sheetOverall],
    ]) {
      if (sheet != null && Math.abs(mine - sheet) > 0.051) {
        warnings.push({ row: rowNumber, title, kind: 'avg-mismatch', detail: `${label}: computed ${mine} vs sheet ${sheet}` });
      }
    }

    const dupKey = `${title.toLowerCase()}|${year}`;
    if (seen.has(dupKey)) {
      warnings.push({ row: rowNumber, title, kind: 'duplicate', detail: `same title+year as row ${seen.get(dupKey)}; keeping the first` });
      return;
    }
    seen.set(dupKey, rowNumber);

    movies.push({
      excelRow: rowNumber,
      title,
      year,
      scores,
      ...totals,
      hashtagPrefix: asString(cellVal(row, 31)),
    });
  });

  return { movies, warnings };
}

// ASL_DB.xlsx 'Sheet1': 1=Dir (only on group's first row), 2=Movie, 3=Year, 7=ASL, 9=marker.
// Contains embedded 'avg=' summary rows and NA/?/_ placeholders to skip.
export async function parseAsl(path) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.getWorksheet('Sheet1');
  if (!ws) throw new Error(`Sheet 'Sheet1' not found in ${path}`);

  const rows = [];
  const skipped = [];
  let currentDirector = null;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const dir = asString(cellVal(row, 1));
    if (dir) currentDirector = dir;
    const title = asString(cellVal(row, 2));
    if (!title || title === 'avg=') return;
    const year = asNumber(cellVal(row, 3));
    const asl = asNumber(cellVal(row, 7));
    const marker = asString(cellVal(row, 9));
    if (asl == null) {
      skipped.push({ row: rowNumber, director: currentDirector, title, year, raw: asString(cellVal(row, 7)) });
      return;
    }
    rows.push({ excelRow: rowNumber, director: currentDirector, title, year, asl, marker });
  });

  return { rows, skipped };
}
