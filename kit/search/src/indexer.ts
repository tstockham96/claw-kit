import Database from 'better-sqlite3';
import { createHash } from 'crypto';
import { readFileSync, statSync, existsSync } from 'fs';
import { join, relative, resolve as pathResolve } from 'path';
import { glob } from 'glob';
import { watch } from 'chokidar';
import { chunkMarkdown } from './chunker.js';
import { createVectorsTable, hasVectorsTable, getVectorCount } from './db.js';
import { isAvailable as embeddingsAvailable, embedBatch, serializeEmbedding } from './embeddings.js';
import type { IndexStats, IndexOptions } from './types.js';

/**
 * Index all .md files in the memory directory.
 * Only re-indexes files that have changed (based on content hash).
 * When opts.embeddings is true, also generates vector embeddings for each chunk.
 */
export async function indexMemory(db: Database.Database, memoryPath: string, opts: IndexOptions = {}): Promise<{ indexed: number; skipped: number; removed: number; embedded?: number }> {
  const absMemoryPath = pathResolve(memoryPath);
  const mdFiles = glob.sync('**/*.md', {
    cwd: absMemoryPath,
    nodir: true,
    ignore: ['**/node_modules/**'],
  });

  let indexed = 0;
  let skipped = 0;

  const existingPaths = new Set(
    (db.prepare(`SELECT path FROM files WHERE source = 'memory'`).all() as Array<{ path: string }>)
      .map(r => r.path)
  );

  const currentPaths = new Set<string>();

  for (const relPath of mdFiles) {
    // Skip .gitkeep files
    if (relPath.endsWith('.gitkeep')) continue;

    const absPath = join(absMemoryPath, relPath);
    currentPaths.add(relPath);

    try {
      const content = readFileSync(absPath, 'utf-8');

      // Skip binary-looking files
      if (isBinary(content)) continue;

      const stat = statSync(absPath);
      const hash = createHash('sha256').update(content).digest('hex').slice(0, 32);

      // Check if already indexed with the same hash
      const existing = db.prepare(`SELECT hash FROM files WHERE path = ?`).get(relPath) as { hash: string } | undefined;
      if (existing && existing.hash === hash) {
        skipped++;
        continue;
      }

      // Index the file
      indexFile(db, relPath, 'memory', content, hash, stat.mtimeMs, stat.size);
      indexed++;
    } catch (err) {
      // Skip files that can't be read
      const message = err instanceof Error ? err.message : String(err);
      console.error(`Warning: Could not index ${relPath}: ${message}`);
    }
  }

  // Remove files that no longer exist
  let removed = 0;
  for (const existingPath of existingPaths) {
    if (!currentPaths.has(existingPath)) {
      removeFile(db, existingPath);
      removed++;
    }
  }

  // Generate embeddings if requested
  let embedded: number | undefined;
  if (opts.embeddings) {
    embedded = await generateEmbeddings(db);
  }

  return { indexed, skipped, removed, embedded };
}

/**
 * Index a session transcript file.
 */
export function indexSession(db: Database.Database, sessionPath: string, content: string): void {
  const hash = createHash('sha256').update(content).digest('hex').slice(0, 32);
  const existing = db.prepare(`SELECT hash FROM files WHERE path = ?`).get(sessionPath) as { hash: string } | undefined;

  if (existing && existing.hash === hash) return;

  indexFile(db, sessionPath, 'sessions', content, hash, Date.now(), Buffer.byteLength(content, 'utf-8'));
}

/**
 * Drop all chunks and reindex everything.
 */
export async function reindexAll(db: Database.Database, memoryPath: string, opts: IndexOptions = {}): Promise<{ indexed: number; embedded?: number }> {
  // Clear all data
  db.exec(`DELETE FROM chunks`);
  db.exec(`DELETE FROM files`);
  // Clear vectors if table exists
  if (hasVectorsTable(db)) {
    db.exec(`DELETE FROM vectors`);
  }
  // Rebuild the FTS index
  db.exec(`INSERT INTO chunks_fts(chunks_fts) VALUES ('rebuild')`);

  const result = await indexMemory(db, memoryPath, opts);
  return { indexed: result.indexed, embedded: result.embedded };
}

/**
 * Get index statistics.
 */
export function getStats(db: Database.Database, dbPath: string): IndexStats {
  const totalFiles = (db.prepare(`SELECT COUNT(*) as count FROM files`).get() as { count: number }).count;
  const totalChunks = (db.prepare(`SELECT COUNT(*) as count FROM chunks`).get() as { count: number }).count;
  const memoryChunks = (db.prepare(`SELECT COUNT(*) as count FROM chunks WHERE source = 'memory'`).get() as { count: number }).count;
  const sessionChunks = (db.prepare(`SELECT COUNT(*) as count FROM chunks WHERE source = 'sessions'`).get() as { count: number }).count;

  const lastIndexedRow = db.prepare(`SELECT MAX(indexed_at) as ts FROM files`).get() as { ts: number | null };
  const lastIndexed = lastIndexedRow.ts
    ? new Date(lastIndexedRow.ts).toISOString().replace('T', ' ').slice(0, 19)
    : 'never';

  let dbSizeBytes = 0;
  try {
    dbSizeBytes = statSync(dbPath).size;
  } catch {
    // db file may not exist yet
  }

  const vectorChunks = getVectorCount(db);

  return {
    totalFiles,
    totalChunks,
    memoryChunks,
    sessionChunks,
    vectorChunks,
    lastIndexed,
    dbSizeBytes,
  };
}

/**
 * Watch the memory directory for changes and auto-reindex.
 * Returns the chokidar watcher instance.
 */
export function watchMemory(db: Database.Database, memoryPath: string): ReturnType<typeof watch> {
  const absMemoryPath = pathResolve(memoryPath);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const pendingFiles = new Set<string>();

  const watcher = watch(join(absMemoryPath, '**/*.md'), {
    ignoreInitial: true,
    ignored: ['**/node_modules/**', '**/.search.db*'],
  });

  const processChanges = () => {
    for (const absPath of pendingFiles) {
      const relPath = relative(absMemoryPath, absPath);

      if (!existsSync(absPath)) {
        // File was deleted
        removeFile(db, relPath);
        console.log(`Removed: ${relPath}`);
        continue;
      }

      try {
        const content = readFileSync(absPath, 'utf-8');
        if (isBinary(content)) continue;

        const stat = statSync(absPath);
        const hash = createHash('sha256').update(content).digest('hex').slice(0, 32);

        const existing = db.prepare(`SELECT hash FROM files WHERE path = ?`).get(relPath) as { hash: string } | undefined;
        if (existing && existing.hash === hash) continue;

        indexFile(db, relPath, 'memory', content, hash, stat.mtimeMs, stat.size);
        console.log(`Indexed: ${relPath}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Warning: Could not index ${relPath}: ${message}`);
      }
    }
    pendingFiles.clear();
  };

  const scheduleProcess = (filePath: string) => {
    pendingFiles.add(filePath);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(processChanges, 2000);
  };

  watcher.on('add', scheduleProcess);
  watcher.on('change', scheduleProcess);
  watcher.on('unlink', scheduleProcess);

  console.log(`Watching ${absMemoryPath} for changes...`);
  return watcher;
}

/**
 * Generate embeddings for all chunks that don't already have them.
 * Uses hash-based dedup to skip chunks whose content hasn't changed.
 * Shows progress during generation since it can be slow.
 */
export async function generateEmbeddings(db: Database.Database): Promise<number> {
  if (!embeddingsAvailable()) {
    console.error('Warning: @huggingface/transformers is not installed. Skipping embedding generation.');
    console.error('Install it with: npm install @huggingface/transformers');
    return 0;
  }

  // Ensure the vectors table exists
  createVectorsTable(db);

  // Find chunks that don't have embeddings yet
  const chunksWithoutVectors = db.prepare(`
    SELECT c.id, c.text, c.hash
    FROM chunks c
    LEFT JOIN vectors v ON c.id = v.chunk_id
    WHERE v.chunk_id IS NULL
  `).all() as Array<{ id: number; text: string; hash: string }>;

  if (chunksWithoutVectors.length === 0) {
    console.log('All chunks already have embeddings.');
    return 0;
  }

  console.log(`Generating embeddings for ${chunksWithoutVectors.length} chunks...`);

  const BATCH_SIZE = 32;
  let embedded = 0;

  const insertVector = db.prepare(`
    INSERT OR REPLACE INTO vectors (chunk_id, embedding) VALUES (?, ?)
  `);

  for (let i = 0; i < chunksWithoutVectors.length; i += BATCH_SIZE) {
    const batch = chunksWithoutVectors.slice(i, i + BATCH_SIZE);
    const texts = batch.map(c => c.text);

    try {
      const embeddings = await embedBatch(texts);

      const insertBatch = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          insertVector.run(batch[j].id, serializeEmbedding(embeddings[j]));
        }
      });
      insertBatch();

      embedded += batch.length;

      // Progress feedback
      const progress = Math.min(100, Math.round(((i + batch.length) / chunksWithoutVectors.length) * 100));
      process.stdout.write(`\r  Progress: ${embedded}/${chunksWithoutVectors.length} chunks (${progress}%)`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`\nWarning: Failed to embed batch starting at chunk ${batch[0].id}: ${message}`);
    }
  }

  console.log(); // newline after progress
  console.log(`Embedded ${embedded} chunks.`);

  return embedded;
}

// --- Internal helpers ---

function indexFile(
  db: Database.Database,
  relPath: string,
  source: 'memory' | 'sessions',
  content: string,
  hash: string,
  mtimeMs: number,
  size: number
): void {
  const now = Date.now();

  // Use a transaction for atomicity
  const transaction = db.transaction(() => {
    // Remove old chunks for this file
    db.prepare(`DELETE FROM chunks WHERE path = ?`).run(relPath);
    // Remove old file record
    db.prepare(`DELETE FROM files WHERE path = ?`).run(relPath);

    // Chunk the content
    const chunks = chunkMarkdown(content, relPath);

    // Insert file record
    db.prepare(`
      INSERT INTO files (path, source, hash, mtime, size, indexed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(relPath, source, hash, Math.floor(mtimeMs), size, now);

    // Insert chunks
    const insertChunk = db.prepare(`
      INSERT INTO chunks (path, source, start_line, end_line, text, hash, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const chunk of chunks) {
      insertChunk.run(relPath, source, chunk.startLine, chunk.endLine, chunk.text, chunk.hash, now);
    }
  });

  transaction();
}

function removeFile(db: Database.Database, relPath: string): void {
  const transaction = db.transaction(() => {
    db.prepare(`DELETE FROM chunks WHERE path = ?`).run(relPath);
    db.prepare(`DELETE FROM files WHERE path = ?`).run(relPath);
  });
  transaction();
}

/**
 * Simple binary detection: check for null bytes in the first 8KB.
 */
function isBinary(content: string): boolean {
  const sample = content.slice(0, 8192);
  return sample.includes('\0');
}
