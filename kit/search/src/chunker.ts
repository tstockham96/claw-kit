import { createHash } from 'crypto';

export interface Chunk {
  text: string;
  startLine: number;
  endLine: number;
  hash: string;
}

const TARGET_CHUNK_SIZE = 800; // approximately 200 tokens

/**
 * Split a markdown file into semantically meaningful chunks.
 *
 * Strategy:
 * 1. Split file into lines
 * 2. Track the current heading (##, ###, etc.)
 * 3. Accumulate lines into a chunk until hitting the target size
 * 4. When starting a new chunk, include the current heading as context prefix
 * 5. Prefer splitting at blank lines rather than mid-paragraph
 */
export function chunkMarkdown(content: string, filePath: string): Chunk[] {
  if (!content || content.trim().length === 0) return [];

  const lines = content.split('\n');
  const chunks: Chunk[] = [];

  let currentHeading = '';
  let currentLines: string[] = [];
  let currentStartLine = 1;
  let currentSize = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1; // 1-indexed

    // Detect headings
    if (/^#{1,6}\s/.test(line)) {
      // If we have accumulated content, flush it as a chunk before the new heading
      if (currentLines.length > 0 && currentSize > 0) {
        const chunk = buildChunk(currentLines, currentStartLine, lineNum - 1);
        if (chunk) chunks.push(chunk);
        currentLines = [];
        currentSize = 0;
        currentStartLine = lineNum;
      }
      currentHeading = line;
    }

    currentLines.push(line);
    currentSize += line.length + 1; // +1 for newline

    // Check if we should split
    if (currentSize >= TARGET_CHUNK_SIZE) {
      // Look for a good split point: a blank line near the end
      const splitIndex = findSplitPoint(currentLines);

      if (splitIndex > 0 && splitIndex < currentLines.length - 1) {
        // Split at the blank line
        const firstPart = currentLines.slice(0, splitIndex + 1);
        const remainder = currentLines.slice(splitIndex + 1);

        const chunkEndLine = currentStartLine + splitIndex;
        const chunk = buildChunk(firstPart, currentStartLine, chunkEndLine);
        if (chunk) chunks.push(chunk);

        // Start new chunk with heading context if available
        currentStartLine = chunkEndLine + 1;
        currentLines = [];
        currentSize = 0;

        // Add heading context to the new chunk if the remainder doesn't start with one
        if (currentHeading && remainder.length > 0 && !/^#{1,6}\s/.test(remainder[0])) {
          // The heading is context only, don't count it in line numbers
          currentLines.push(currentHeading);
          currentSize += currentHeading.length + 1;
        }

        for (const remainderLine of remainder) {
          currentLines.push(remainderLine);
          currentSize += remainderLine.length + 1;
        }
      }
      // If no good split point, just continue accumulating
      // (will flush at the next blank line or heading or end of file)
    }
  }

  // Flush remaining content
  if (currentLines.length > 0) {
    const chunk = buildChunk(currentLines, currentStartLine, lines.length);
    if (chunk) chunks.push(chunk);
  }

  return chunks;
}

/**
 * Find the best split point (blank line) in the accumulated lines,
 * preferring a position roughly in the middle or slightly past center.
 */
function findSplitPoint(lines: string[]): number {
  const target = Math.floor(lines.length * 0.6);
  let bestIndex = -1;
  let bestDistance = Infinity;

  for (let i = Math.floor(lines.length * 0.3); i < lines.length; i++) {
    if (lines[i].trim() === '') {
      const distance = Math.abs(i - target);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = i;
      }
    }
  }

  return bestIndex;
}

/**
 * Build a chunk from lines, computing the hash.
 * Returns null if the text is empty/whitespace.
 */
function buildChunk(lines: string[], startLine: number, endLine: number): Chunk | null {
  const text = lines.join('\n').trim();
  if (text.length === 0) return null;

  const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);

  return {
    text,
    startLine,
    endLine,
    hash,
  };
}
