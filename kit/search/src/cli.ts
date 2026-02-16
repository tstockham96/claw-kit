#!/usr/bin/env node

import { resolve, join, relative } from 'path';
import { readFileSync } from 'fs';
import { createDatabase } from './db.js';
import { indexMemory, indexSession, reindexAll, watchMemory, getStats, generateEmbeddings } from './indexer.js';
import { search, hybridSearch, getFileChunk } from './search.js';
import { logSession } from './sessions.js';

// --- Argument parsing ---

interface ParsedArgs {
  command: string;
  positional: string[];
  flags: Record<string, string>;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2); // skip node and script path
  const command = args[0] ?? 'help';
  const positional: string[] = [];
  const flags: Record<string, string> = {};

  for (let i = 1; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = 'true';
      }
    } else {
      positional.push(arg);
    }
  }

  return { command, positional, flags };
}

function getMemoryPath(flags: Record<string, string>): string {
  return resolve(flags['memory-path'] ?? join(__dirname, '..', '..', 'memory'));
}

function getDbPath(flags: Record<string, string>, memoryPath: string): string {
  return resolve(flags['db-path'] ?? join(memoryPath, '.search.db'));
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Commands ---

async function cmdIndex(flags: Record<string, string>): Promise<void> {
  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const withEmbeddings = flags['embeddings'] === 'true';

  console.log(`Indexing memory files from: ${memoryPath}`);
  console.log(`Database: ${dbPath}`);
  if (withEmbeddings) {
    console.log('Embeddings: enabled (will generate vector embeddings)');
  }

  const db = createDatabase(dbPath);

  const forceReindex = flags['reindex'] === 'true';
  let result: { indexed: number; skipped?: number; removed?: number; embedded?: number };

  if (forceReindex) {
    result = await reindexAll(db, memoryPath, { embeddings: withEmbeddings });
    console.log(`\nReindexed ${result.indexed} files (full rebuild).`);
  } else {
    result = await indexMemory(db, memoryPath, { embeddings: withEmbeddings });
    console.log(`\nIndexed: ${result.indexed}, Skipped (unchanged): ${result.skipped}, Removed: ${result.removed}`);
  }

  if (result.embedded !== undefined) {
    console.log(`Embeddings: ${result.embedded} chunks embedded.`);
  }

  const stats = getStats(db, dbPath);
  console.log(`Total: ${stats.totalChunks} chunks from ${stats.totalFiles} files.`);
  if (stats.vectorChunks > 0) {
    console.log(`Vectors: ${stats.vectorChunks} chunks have embeddings.`);
  }

  db.close();
}

async function cmdSearch(positional: string[], flags: Record<string, string>): Promise<void> {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: claw-search search <query> [--limit N] [--source memory|sessions|all] [--hybrid]');
    process.exit(1);
  }

  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const useHybrid = flags['hybrid'] === 'true';
  const db = createDatabase(dbPath);

  // Auto-index if database is empty
  const stats = getStats(db, dbPath);
  if (stats.totalChunks === 0) {
    console.log('Index is empty, building index first...\n');
    await indexMemory(db, memoryPath);
  }

  const limit = flags['limit'] ? parseInt(flags['limit'], 10) : 10;
  const sourceFlag = flags['source'] as 'memory' | 'sessions' | 'all' | undefined;
  const source = sourceFlag ?? 'all';

  const startTime = performance.now();

  let results: import('./types.js').SearchResult[];
  let searchMode: string;

  if (useHybrid) {
    const hybridResult = await hybridSearch(db, query, { maxResults: limit, source });
    results = hybridResult.results;
    searchMode = hybridResult.mode === 'hybrid' ? '(hybrid)' : '(BM25)';
  } else {
    results = search(db, query, { maxResults: limit, source });
    searchMode = '(BM25)';
  }

  const elapsed = (performance.now() - startTime).toFixed(0);

  console.log(`## Results for: "${query}" ${searchMode}\n`);

  if (results.length === 0) {
    console.log('No results found.\n');
  } else {
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const score = r.score.toFixed(2);
      const snippetLines = r.snippet.split('\n');
      // Show first 3 non-empty lines as preview
      const preview = snippetLines
        .filter(l => l.trim().length > 0)
        .slice(0, 3)
        .map(l => `   > ${l.length > 100 ? l.slice(0, 100) + '...' : l}`)
        .join('\n');

      console.log(`${i + 1}. [${score}] ${r.path} (lines ${r.startLine}-${r.endLine})`);
      console.log(preview);
      console.log();
    }
  }

  const updatedStats = getStats(db, dbPath);
  console.log(`Found ${results.length} results in ${elapsed}ms ${searchMode}. Index: ${updatedStats.totalChunks} chunks from ${updatedStats.totalFiles} files.`);
  if (updatedStats.vectorChunks > 0) {
    console.log(`Vectors: ${updatedStats.vectorChunks} chunks have embeddings.`);
  }

  db.close();
}

function cmdGet(positional: string[], flags: Record<string, string>): void {
  const filePath = positional[0];
  if (!filePath) {
    console.error('Usage: claw-search get <file-path> [--from LINE] [--lines COUNT]');
    process.exit(1);
  }

  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);

  const fromLine = flags['from'] ? parseInt(flags['from'], 10) : undefined;
  const lineCount = flags['lines'] ? parseInt(flags['lines'], 10) : undefined;

  const content = getFileChunk(db, filePath, fromLine, lineCount);

  if (content === null) {
    console.error(`No content found for: ${filePath}`);
    console.error('Has the file been indexed? Run: claw-search index');
    process.exit(1);
  }

  console.log(content);

  db.close();
}

function cmdStatus(flags: Record<string, string>): void {
  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);

  const stats = getStats(db, dbPath);

  console.log('## Claw Kit Search Index\n');
  console.log(`- Files indexed: ${stats.totalFiles}`);
  console.log(`- Memory chunks: ${stats.memoryChunks}`);
  console.log(`- Session chunks: ${stats.sessionChunks}`);
  console.log(`- Total chunks: ${stats.totalChunks}`);
  console.log(`- Vector embeddings: ${stats.vectorChunks}${stats.vectorChunks > 0 && stats.totalChunks > 0 ? ` (${Math.round(stats.vectorChunks / stats.totalChunks * 100)}% coverage)` : ''}`);
  console.log(`- Database size: ${formatBytes(stats.dbSizeBytes)}`);
  console.log(`- Last indexed: ${stats.lastIndexed}`);

  db.close();
}

async function cmdWatch(flags: Record<string, string>): Promise<void> {
  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);

  // Initial index
  console.log('Building initial index...');
  const result = await indexMemory(db, memoryPath);
  console.log(`Indexed ${result.indexed} files (${result.skipped} unchanged).\n`);

  // Watch for changes
  const watcher = watchMemory(db, memoryPath);

  // Handle graceful shutdown
  const shutdown = () => {
    console.log('\nShutting down watcher...');
    watcher.close().then(() => {
      db.close();
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function cmdLog(positional: string[], flags: Record<string, string>): Promise<void> {
  const message = positional.join(' ');
  if (!message) {
    console.error('Usage: claw-search log <message> [--session-id ID]');
    process.exit(1);
  }

  const memoryPath = getMemoryPath(flags);
  const sessionId = flags['session-id'] ?? `cli-${Date.now()}`;

  const filePath = logSession(memoryPath, sessionId, {
    role: 'user',
    content: message,
    source: 'claude-code',
  });

  console.log(`Logged to: ${filePath}`);

  // Also index the session file
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);
  const content = readFileSync(filePath, 'utf-8');
  const relPath = relative(memoryPath, filePath);
  indexSession(db, relPath, content);
  db.close();

  console.log('Session entry indexed.');
}

function printHelp(): void {
  console.log(`
claw-search - Semantic search for Claw Kit memory files

Commands:
  index    [--memory-path PATH] [--db-path PATH] [--reindex] [--embeddings]
           Index all memory files. Use --embeddings to generate vector embeddings.

  search   <query> [--limit N] [--source memory|sessions|all] [--hybrid] [--memory-path PATH] [--db-path PATH]
           Search memory. Returns ranked results with snippets.
           Use --hybrid for combined BM25 + vector search (requires embeddings).

  get      <file-path> [--from LINE] [--lines COUNT]
           Get content from a specific indexed memory file.

  status   [--db-path PATH]
           Show index statistics.

  watch    [--memory-path PATH] [--db-path PATH]
           Watch memory directory and auto-reindex on changes.

  log      <message> [--session-id ID] [--memory-path PATH] [--db-path PATH]
           Log a session entry.

  help     Show this help message.

Defaults:
  --memory-path  ../memory (relative to this script)
  --db-path      <memory-path>/.search.db

Embeddings (optional):
  Install @huggingface/transformers for vector search support:
    npm install @huggingface/transformers
  Then index with: claw-search index --embeddings
  And search with: claw-search search "query" --hybrid
`);
}

// --- Main ---

async function main(): Promise<void> {
  const { command, positional, flags } = parseArgs(process.argv);

  switch (command) {
    case 'index':
      await cmdIndex(flags);
      break;
    case 'search':
      await cmdSearch(positional, flags);
      break;
    case 'get':
      cmdGet(positional, flags);
      break;
    case 'status':
      cmdStatus(flags);
      break;
    case 'watch':
      await cmdWatch(flags);
      break;
    case 'log':
      await cmdLog(positional, flags);
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

main();
