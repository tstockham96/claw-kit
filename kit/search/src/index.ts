export { createDatabase, createVectorsTable, hasVectorsTable, getVectorCount } from './db.js';
export { chunkMarkdown } from './chunker.js';
export { indexMemory, indexSession, reindexAll, watchMemory, getStats, generateEmbeddings } from './indexer.js';
export { search, hybridSearch, getFileChunk } from './search.js';
export { logSession, listSessions, getSessionTranscript } from './sessions.js';
export {
  embed,
  embedBatch,
  isAvailable as isEmbeddingsAvailable,
  cosineSimilarity,
  serializeEmbedding,
  deserializeEmbedding,
  EMBEDDING_DIM,
} from './embeddings.js';
export type {
  ChunkRecord,
  SearchResult,
  IndexStats,
  SearchOptions,
  HybridSearchOptions,
  VectorRecord,
  IndexOptions,
  SessionEntry,
} from './types.js';
