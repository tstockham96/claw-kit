export interface ChunkRecord {
  id: number;
  path: string;           // relative path like "people/alice.md"
  source: 'memory' | 'sessions';
  startLine: number;
  endLine: number;
  text: string;
  hash: string;           // content hash for dedup
  updatedAt: number;      // timestamp
}

export interface SearchResult {
  path: string;
  snippet: string;
  startLine: number;
  endLine: number;
  score: number;
  source: 'memory' | 'sessions';
}

export interface IndexStats {
  totalFiles: number;
  totalChunks: number;
  memoryChunks: number;
  sessionChunks: number;
  vectorChunks: number;
  lastIndexed: string;
  dbSizeBytes: number;
}

export interface SearchOptions {
  maxResults?: number;    // default: 10
  minScore?: number;      // default: 0.0 (return all)
  source?: 'memory' | 'sessions' | 'all';  // default: 'all'
}

export interface HybridSearchOptions extends SearchOptions {
  bm25Weight?: number;    // default: 0.5
  vectorWeight?: number;  // default: 0.5
}

export interface VectorRecord {
  chunkId: number;
  embedding: Buffer;
}

export interface IndexOptions {
  embeddings?: boolean;   // default: false — generate vector embeddings
}

export interface SessionEntry {
  timestamp: string;
  sessionId: string;
  role: string;
  content: string;
  source: 'claude-code' | 'telegram';
}
