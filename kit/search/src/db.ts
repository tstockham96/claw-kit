import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'fs';

export function createDatabase(dbPath: string): Database.Database {
  const dir = dbPath.substring(0, dbPath.lastIndexOf('/'));
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');      // faster concurrent reads
  db.pragma('foreign_keys = ON');

  // Files table -- tracks indexed files
  db.exec(`
    CREATE TABLE IF NOT EXISTS files (
      path TEXT PRIMARY KEY,
      source TEXT NOT NULL DEFAULT 'memory',
      hash TEXT NOT NULL,
      mtime INTEGER NOT NULL,
      size INTEGER NOT NULL,
      indexed_at INTEGER NOT NULL
    )
  `);

  // Chunks table -- the core memory unit
  db.exec(`
    CREATE TABLE IF NOT EXISTS chunks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'memory',
      start_line INTEGER NOT NULL,
      end_line INTEGER NOT NULL,
      text TEXT NOT NULL,
      hash TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (path) REFERENCES files(path) ON DELETE CASCADE
    )
  `);

  // FTS5 virtual table for full-text search with BM25 ranking
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
      text,
      content=chunks,
      content_rowid=id,
      tokenize='porter unicode61'
    )
  `);

  // Triggers to keep FTS in sync with chunks
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ai AFTER INSERT ON chunks BEGIN
      INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_ad AFTER DELETE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
    END
  `);
  db.exec(`
    CREATE TRIGGER IF NOT EXISTS chunks_au AFTER UPDATE ON chunks BEGIN
      INSERT INTO chunks_fts(chunks_fts, rowid, text) VALUES ('delete', old.id, old.text);
      INSERT INTO chunks_fts(rowid, text) VALUES (new.id, new.text);
    END
  `);

  // Indexes for fast lookups
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_path ON chunks(path)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source)`);

  return db;
}
