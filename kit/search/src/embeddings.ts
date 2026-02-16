/**
 * Embedding wrapper for optional vector search.
 *
 * Uses @huggingface/transformers with all-MiniLM-L6-v2 for local embeddings.
 * The library is dynamically imported so the package works without it installed.
 */

// The dimension of the all-MiniLM-L6-v2 model output
export const EMBEDDING_DIM = 384;

const MODEL_NAME = 'Xenova/all-MiniLM-L6-v2';

// Lazy-loaded pipeline reference
let pipelineInstance: any = null;
let loadingPromise: Promise<any> | null = null;
let availabilityChecked = false;
let isAvailableResult = false;

/**
 * Check whether @huggingface/transformers can be loaded.
 * Result is cached after the first call.
 */
export function isAvailable(): boolean {
  if (availabilityChecked) return isAvailableResult;

  try {
    // Check if the module can be resolved without actually loading it.
    // We use require.resolve wrapped in a try/catch for a synchronous check.
    require.resolve('@huggingface/transformers');
    isAvailableResult = true;
  } catch {
    isAvailableResult = false;
  }

  availabilityChecked = true;
  return isAvailableResult;
}

/**
 * Load the feature-extraction pipeline lazily.
 * Only called when embeddings are actually needed.
 */
async function getPipeline(): Promise<any> {
  if (pipelineInstance) return pipelineInstance;

  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    // Dynamic import so the package works without @huggingface/transformers installed.
    // Use a variable for the module specifier to prevent TypeScript from requiring
    // the types at compile time.
    const moduleName = '@huggingface/transformers';
    const mod = await import(/* webpackIgnore: true */ moduleName) as {
      pipeline: (task: string, model: string, opts?: Record<string, unknown>) => Promise<any>;
    };

    console.log(`Loading embedding model: ${MODEL_NAME}...`);
    pipelineInstance = await mod.pipeline('feature-extraction', MODEL_NAME, {
      dtype: 'fp32',
    });
    console.log('Embedding model loaded.');

    return pipelineInstance;
  })();

  return loadingPromise;
}

/**
 * Embed a single text string into a Float32Array vector.
 */
export async function embed(text: string): Promise<Float32Array> {
  const extractor = await getPipeline();
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  // output.data is a Float32Array for a single input
  return new Float32Array(output.data);
}

/**
 * Embed a batch of texts into Float32Array vectors.
 * Returns one Float32Array per input text.
 */
export async function embedBatch(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];

  const extractor = await getPipeline();
  const output = await extractor(texts, { pooling: 'mean', normalize: true });

  // For a batch, output.data contains all embeddings concatenated.
  // Each embedding is EMBEDDING_DIM floats long.
  const rawData: Float32Array = output.data;
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i++) {
    const start = i * EMBEDDING_DIM;
    const end = start + EMBEDDING_DIM;
    results.push(new Float32Array(rawData.slice(start, end)));
  }

  return results;
}

/**
 * Compute cosine similarity between two vectors.
 * Assumes both vectors are already normalized (which they are from our pipeline).
 * For normalized vectors, cosine similarity is just the dot product.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dotProduct = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
  }
  return dotProduct;
}

/**
 * Serialize a Float32Array embedding to a Buffer for storage in SQLite BLOB.
 */
export function serializeEmbedding(embedding: Float32Array): Buffer {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

/**
 * Deserialize a Buffer (from SQLite BLOB) back into a Float32Array.
 */
export function deserializeEmbedding(buffer: Buffer): Float32Array {
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  );
  return new Float32Array(arrayBuffer);
}
