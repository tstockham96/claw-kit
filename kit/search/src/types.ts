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
  lastIndexed: string;
  dbSizeBytes: number;
}

export interface SearchOptions {
  maxResults?: number;    // default: 10
  minScore?: number;      // default: 0.0 (return all)
  source?: 'memory' | 'sessions' | 'all';  // default: 'all'
}

export interface SessionEntry {
  timestamp: string;
  sessionId: string;
  role: string;
  content: string;
  source: 'claude-code' | 'telegram';
}
