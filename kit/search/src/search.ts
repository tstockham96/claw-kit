import Database from 'better-sqlite3';
import { hasVectorsTable } from './db.js';
import {
  isAvailable as embeddingsAvailable,
  embed,
  cosineSimilarity,
  deserializeEmbedding,
} from './embeddings.js';
import type { SearchResult, SearchOptions, HybridSearchOptions } from './types.js';

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
    const simpleWords = query.split(/\s+/)
      .filter(w => w.length > 1)
      .map(w => w.replace(/[:*^()"']/g, ''));
    const simpleFts = simpleWords.filter(w => w.length > 0).map(w => `"${w}"`).join(' OR ');
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
    .map(w => w.replace(/[:*^()"']/g, ''));

  if (words.length === 0) return '';

  // Use OR between quoted words for broader matching
  return words.map(w => `"${w}"`).join(' OR ');
}

/**
 * Perform a hybrid search combining BM25 full-text and vector cosine similarity.
 *
 * Strategy:
 * 1. Run BM25 search to get text-matched results
 * 2. Embed the query and compute cosine similarity against stored vectors
 * 3. Merge scores: hybrid = bm25Weight * bm25_score + vectorWeight * cosine_score
 *
 * Falls back to BM25-only if no vectors exist or embeddings are unavailable.
 */
export async function hybridSearch(
  db: Database.Database,
  query: string,
  opts: HybridSearchOptions = {}
): Promise<{ results: SearchResult[]; mode: 'hybrid' | 'bm25' }> {
  const maxResults = opts.maxResults ?? 10;
  const minScore = opts.minScore ?? 0.0;
  const source = opts.source ?? 'all';
  const bm25Weight = opts.bm25Weight ?? 0.5;
  const vectorWeight = opts.vectorWeight ?? 0.5;

  // Get BM25 results (fetch more than needed for merging)
  const bm25Results = search(db, query, {
    maxResults: maxResults * 3,
    minScore: 0,
    source,
  });

  // Check if vector search is possible
  const canDoVectors = embeddingsAvailable() && hasVectorsTable(db);

  if (!canDoVectors) {
    // Fall back to BM25-only
    const limited = bm25Results.slice(0, maxResults).filter(r => r.score >= minScore);
    return { results: limited, mode: 'bm25' };
  }

  // Check if there are actually vectors stored
  const vectorCountRow = db.prepare(`SELECT COUNT(*) as count FROM vectors`).get() as { count: number };
  if (vectorCountRow.count === 0) {
    const limited = bm25Results.slice(0, maxResults).filter(r => r.score >= minScore);
    return { results: limited, mode: 'bm25' };
  }

  // Embed the query
  let queryEmbedding: Float32Array;
  try {
    queryEmbedding = await embed(query);
  } catch {
    // If embedding fails, fall back to BM25
    const limited = bm25Results.slice(0, maxResults).filter(r => r.score >= minScore);
    return { results: limited, mode: 'bm25' };
  }

  // Build a map of chunk_id -> BM25 score for fast lookup
  // We need to query chunk IDs for the BM25 results
  const bm25Map = new Map<number, { result: SearchResult; bm25Score: number }>();

  for (const r of bm25Results) {
    // Look up the chunk ID for this result
    const chunk = db.prepare(
      `SELECT id FROM chunks WHERE path = ? AND start_line = ? AND end_line = ?`
    ).get(r.path, r.startLine, r.endLine) as { id: number } | undefined;

    if (chunk) {
      bm25Map.set(chunk.id, { result: r, bm25Score: r.score });
    }
  }

  // Get all vectors and compute cosine similarity
  let vectorSql = `
    SELECT v.chunk_id, v.embedding, c.path, c.text AS snippet,
           c.start_line AS startLine, c.end_line AS endLine, c.source
    FROM vectors v
    JOIN chunks c ON v.chunk_id = c.id
  `;

  const vectorParams: string[] = [];
  if (source !== 'all') {
    vectorSql += ` WHERE c.source = ?`;
    vectorParams.push(source);
  }

  const vectorRows = db.prepare(vectorSql).all(...vectorParams) as Array<{
    chunk_id: number;
    embedding: Buffer;
    path: string;
    snippet: string;
    startLine: number;
    endLine: number;
    source: 'memory' | 'sessions';
  }>;

  // Compute cosine similarities and find max for normalization
  const vectorScores = new Map<number, { cosine: number; row: typeof vectorRows[0] }>();
  let maxCosine = 0;

  for (const row of vectorRows) {
    const storedEmbedding = deserializeEmbedding(row.embedding);
    const cosine = cosineSimilarity(queryEmbedding, storedEmbedding);
    // Cosine similarity can be negative for normalized vectors; clamp to [0, 1]
    const clampedCosine = Math.max(0, cosine);
    vectorScores.set(row.chunk_id, { cosine: clampedCosine, row });
    if (clampedCosine > maxCosine) maxCosine = clampedCosine;
  }

  // Normalize cosine scores to [0, 1]
  if (maxCosine > 0) {
    for (const entry of vectorScores.values()) {
      entry.cosine = entry.cosine / maxCosine;
    }
  }

  // Merge scores across all chunk IDs seen in either BM25 or vector results
  const allChunkIds = new Set([...bm25Map.keys(), ...vectorScores.keys()]);
  const merged: Array<{ chunkId: number; score: number; result: SearchResult }> = [];

  for (const chunkId of allChunkIds) {
    const bm25Entry = bm25Map.get(chunkId);
    const vectorEntry = vectorScores.get(chunkId);

    const bm25Score = bm25Entry?.bm25Score ?? 0;
    const cosineScore = vectorEntry?.cosine ?? 0;

    const hybridScore = bm25Weight * bm25Score + vectorWeight * cosineScore;

    // Use the BM25 result object if we have it, otherwise construct from vector data
    let resultObj: SearchResult;
    if (bm25Entry) {
      resultObj = { ...bm25Entry.result, score: hybridScore };
    } else if (vectorEntry) {
      resultObj = {
        path: vectorEntry.row.path,
        snippet: vectorEntry.row.snippet,
        startLine: vectorEntry.row.startLine,
        endLine: vectorEntry.row.endLine,
        score: hybridScore,
        source: vectorEntry.row.source,
      };
    } else {
      continue;
    }

    merged.push({ chunkId, score: hybridScore, result: resultObj });
  }

  // Sort by hybrid score descending
  merged.sort((a, b) => b.score - a.score);

  // Normalize final scores to [0, 1]
  if (merged.length > 0) {
    const maxHybrid = merged[0].score;
    if (maxHybrid > 0) {
      for (const m of merged) {
        m.result.score = m.result.score / maxHybrid;
      }
    }
  }

  const finalResults = merged
    .slice(0, maxResults)
    .map(m => m.result)
    .filter(r => r.score >= minScore);

  return { results: finalResults, mode: 'hybrid' };
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
