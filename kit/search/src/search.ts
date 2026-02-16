import Database from 'better-sqlite3';
import type { SearchResult, SearchOptions } from './types.js';

/**
 * Perform a BM25 full-text search across indexed chunks.
 */
export function search(db: Database.Database, query: string, opts: SearchOptions = {}): SearchResult[] {
  const maxResults = opts.maxResults ?? 10;
  const minScore = opts.minScore ?? 0.0;
  const source = opts.source ?? 'all';

  const ftsQuery = formatFtsQuery(query);
  if (!ftsQuery) return [];

  let sql = `
    SELECT
      c.path,
      c.text AS snippet,
      c.start_line AS startLine,
      c.end_line AS endLine,
      c.source,
      rank * -1 AS score
    FROM chunks_fts
    JOIN chunks c ON chunks_fts.rowid = c.id
    WHERE chunks_fts MATCH ?
  `;

  const params: (string | number)[] = [ftsQuery];

  if (source !== 'all') {
    sql += ` AND c.source = ?`;
    params.push(source);
  }

  sql += ` ORDER BY rank LIMIT ?`;
  params.push(maxResults);

  let results: SearchResult[];
  try {
    results = db.prepare(sql).all(...params) as SearchResult[];
  } catch {
    // If FTS query fails (bad syntax), fall back to simpler query
    const simpleFts = query.split(/\s+/).filter(w => w.length > 1).join(' ');
    if (!simpleFts) return [];
    params[0] = simpleFts;
    try {
      results = db.prepare(sql).all(...params) as SearchResult[];
    } catch {
      return [];
    }
  }

  // Normalize scores to 0-1 range
  if (results.length > 0) {
    const maxScore = Math.max(...results.map(r => r.score));
    if (maxScore > 0) {
      for (const r of results) {
        r.score = r.score / maxScore;
      }
    }
  }

  return results.filter(r => r.score >= minScore);
}

/**
 * Format a natural language query for FTS5.
 * Split into words, remove very short words, join with OR for broader matching.
 */
function formatFtsQuery(query: string): string {
  const words = query
    .split(/\s+/)
    .filter(w => w.length > 1)
    .map(w => w.replace(/['"]/g, ''));

  if (words.length === 0) return '';

  // Use OR between quoted words for broader matching
  return words.map(w => `"${w}"`).join(' OR ');
}

/**
 * Get specific lines from a file by retrieving its chunks.
 * Useful for "memory_get" equivalent -- reading detailed content after search.
 */
export function getFileChunk(
  db: Database.Database,
  path: string,
  fromLine?: number,
  lineCount?: number
): string | null {
  let sql = `SELECT text, start_line, end_line FROM chunks WHERE path = ?`;
  const params: (string | number)[] = [path];

  if (fromLine !== undefined) {
    sql += ` AND end_line >= ? AND start_line <= ?`;
    params.push(fromLine);
    params.push(fromLine + (lineCount ?? 20));
  }

  sql += ` ORDER BY start_line`;

  const chunks = db.prepare(sql).all(...params) as Array<{
    text: string;
    start_line: number;
    end_line: number;
  }>;

  if (chunks.length === 0) return null;

  return chunks.map(c => c.text).join('\n');
}
