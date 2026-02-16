export { createDatabase } from './db.js';
export { chunkMarkdown } from './chunker.js';
export { indexMemory, indexSession, reindexAll, watchMemory, getStats } from './indexer.js';
export { search, getFileChunk } from './search.js';
export { logSession, listSessions, getSessionTranscript } from './sessions.js';
export type { ChunkRecord, SearchResult, IndexStats, SearchOptions, SessionEntry } from './types.js';
