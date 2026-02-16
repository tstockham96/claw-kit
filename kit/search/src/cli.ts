#!/usr/bin/env node

import { resolve, join, relative } from 'path';
import { readFileSync } from 'fs';
import { createDatabase } from './db.js';
import { indexMemory, indexSession, reindexAll, watchMemory, getStats } from './indexer.js';
import { search, getFileChunk } from './search.js';
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

function cmdIndex(flags: Record<string, string>): void {
  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);

  console.log(`Indexing memory files from: ${memoryPath}`);
  console.log(`Database: ${dbPath}`);

  const db = createDatabase(dbPath);

  const forceReindex = flags['reindex'] === 'true';
  let result: { indexed: number; skipped?: number; removed?: number };

  if (forceReindex) {
    result = reindexAll(db, memoryPath);
    console.log(`\nReindexed ${result.indexed} files (full rebuild).`);
  } else {
    result = indexMemory(db, memoryPath);
    console.log(`\nIndexed: ${result.indexed}, Skipped (unchanged): ${result.skipped}, Removed: ${result.removed}`);
  }

  const stats = getStats(db, dbPath);
  console.log(`Total: ${stats.totalChunks} chunks from ${stats.totalFiles} files.`);

  db.close();
}

function cmdSearch(positional: string[], flags: Record<string, string>): void {
  const query = positional.join(' ');
  if (!query) {
    console.error('Usage: claw-search search <query> [--limit N] [--source memory|sessions|all]');
    process.exit(1);
  }

  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);

  // Auto-index if database is empty
  const stats = getStats(db, dbPath);
  if (stats.totalChunks === 0) {
    console.log('Index is empty, building index first...\n');
    indexMemory(db, memoryPath);
  }

  const limit = flags['limit'] ? parseInt(flags['limit'], 10) : 10;
  const sourceFlag = flags['source'] as 'memory' | 'sessions' | 'all' | undefined;
  const source = sourceFlag ?? 'all';

  const startTime = performance.now();
  const results = search(db, query, { maxResults: limit, source });
  const elapsed = (performance.now() - startTime).toFixed(0);

  console.log(`## Results for: "${query}"\n`);

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
  console.log(`Found ${results.length} results in ${elapsed}ms. Index: ${updatedStats.totalChunks} chunks from ${updatedStats.totalFiles} files.`);

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
  console.log(`- Database size: ${formatBytes(stats.dbSizeBytes)}`);
  console.log(`- Last indexed: ${stats.lastIndexed}`);

  db.close();
}

function cmdWatch(flags: Record<string, string>): void {
  const memoryPath = getMemoryPath(flags);
  const dbPath = getDbPath(flags, memoryPath);
  const db = createDatabase(dbPath);

  // Initial index
  console.log('Building initial index...');
  const result = indexMemory(db, memoryPath);
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

function cmdLog(positional: string[], flags: Record<string, string>): void {
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
  index    [--memory-path PATH] [--db-path PATH] [--reindex]
           Index all memory files.

  search   <query> [--limit N] [--source memory|sessions|all] [--memory-path PATH] [--db-path PATH]
           Search memory. Returns ranked results with snippets.

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
`);
}

// --- Main ---

function main(): void {
  const { command, positional, flags } = parseArgs(process.argv);

  switch (command) {
    case 'index':
      cmdIndex(flags);
      break;
    case 'search':
      cmdSearch(positional, flags);
      break;
    case 'get':
      cmdGet(positional, flags);
      break;
    case 'status':
      cmdStatus(flags);
      break;
    case 'watch':
      cmdWatch(flags);
      break;
    case 'log':
      cmdLog(positional, flags);
      break;
    case 'help':
    default:
      printHelp();
      break;
  }
}

main();
