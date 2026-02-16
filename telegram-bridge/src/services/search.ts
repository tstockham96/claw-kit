import Database from 'better-sqlite3';
import { resolve } from 'path';
import { existsSync } from 'fs';

export interface TelegramSearchResult {
  path: string;
  snippet: string;
  startLine: number;
  endLine: number;
  score: number;
}

/**
 * Self-contained search service that reads from the Claw Kit search database.
 * Opens the SQLite DB in readonly mode -- indexing is handled by kit/search.
 */
export class SearchService {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(memoryPath: string) {
    this.dbPath = resolve(memoryPath, '.search.db');
  }

  private ensureDb(): Database.Database | null {
    if (this.db) return this.db;
    if (!existsSync(this.dbPath)) return null;

    try {
      this.db = new Database(this.dbPath, { readonly: true });
      this.db.pragma('journal_mode = WAL');
      return this.db;
    } catch {
      return null;
    }
  }

  /**
   * Check whether the search database is available.
   */
  isAvailable(): boolean {
    return this.ensureDb() !== null;
  }

  /**
   * Get basic stats about the search index for /status reporting.
   */
  getStats(): { totalChunks: number; totalFiles: number } | null {
    const db = this.ensureDb();
    if (!db) return null;

    try {
      const chunks = db.prepare('SELECT COUNT(*) AS count FROM chunks').get() as { count: number };
      const files = db.prepare('SELECT COUNT(*) AS count FROM files').get() as { count: number };
      return { totalChunks: chunks.count, totalFiles: files.count };
    } catch {
      return null;
    }
  }

  /**
   * Full-text search across indexed memory chunks using BM25 ranking.
   * Returns results sorted by relevance with normalized scores (0-1).
   */
  search(query: string, limit: number = 8): TelegramSearchResult[] {
    const db = this.ensureDb();
    if (!db) return [];

    try {
      const ftsQuery = this.formatFtsQuery(query);
      if (!ftsQuery) return [];

      let results: TelegramSearchResult[];
      try {
        results = db.prepare(`
          SELECT
            c.path,
            c.text AS snippet,
            c.start_line AS startLine,
            c.end_line AS endLine,
            rank * -1 AS score
          FROM chunks_fts
          JOIN chunks c ON chunks_fts.rowid = c.id
          WHERE chunks_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `).all(ftsQuery, limit) as TelegramSearchResult[];
      } catch {
        // If FTS query fails (bad syntax), fall back to simpler query
        const simpleWords = query.split(/\s+/)
          .filter(w => w.length > 1)
          .map(w => w.replace(/[:*^()"']/g, ''));
        const simpleFts = simpleWords.filter(w => w.length > 0).map(w => `"${w}"`).join(' OR ');
        if (!simpleFts) return [];
        try {
          results = db.prepare(`
            SELECT
              c.path,
              c.text AS snippet,
              c.start_line AS startLine,
              c.end_line AS endLine,
              rank * -1 AS score
            FROM chunks_fts
            JOIN chunks c ON chunks_fts.rowid = c.id
            WHERE chunks_fts MATCH ?
            ORDER BY rank
            LIMIT ?
          `).all(simpleFts, limit) as TelegramSearchResult[];
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

      return results;
    } catch {
      return [];
    }
  }

  /**
   * Format a natural language query for FTS5.
   * Splits into words, removes very short words, joins with OR for broader matching.
   */
  private formatFtsQuery(query: string): string {
    const words = query
      .split(/\s+/)
      .filter(w => w.length > 1)
      .map(w => w.replace(/[:*^()"']/g, ''));

    if (words.length === 0) return '';

    return words.map(w => `"${w}"`).join(' OR ');
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
