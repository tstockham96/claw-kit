import { existsSync, mkdirSync, readFileSync, appendFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { SessionEntry } from './types.js';

/**
 * Append a JSONL entry to the session log for today.
 * Creates the sessions/ directory and file if they don't exist.
 */
export function logSession(
  memoryPath: string,
  sessionId: string,
  entry: Omit<SessionEntry, 'timestamp' | 'sessionId'>
): string {
  const sessionsDir = join(memoryPath, 'sessions');
  if (!existsSync(sessionsDir)) {
    mkdirSync(sessionsDir, { recursive: true });
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const filePath = join(sessionsDir, `${today}.jsonl`);

  const fullEntry: SessionEntry = {
    timestamp: new Date().toISOString(),
    sessionId,
    role: entry.role,
    content: entry.content.substring(0, 5000),
    source: entry.source,
  };

  const line = JSON.stringify(fullEntry) + '\n';
  appendFileSync(filePath, line, 'utf-8');

  return filePath;
}

/**
 * List recent session files, sorted newest first.
 */
export function listSessions(memoryPath: string): string[] {
  const sessionsDir = join(memoryPath, 'sessions');
  if (!existsSync(sessionsDir)) return [];

  const files = readdirSync(sessionsDir)
    .filter(f => f.endsWith('.jsonl'))
    .sort()
    .reverse();

  return files;
}

/**
 * Read and parse a session file for a given date.
 * Returns the array of session entries.
 */
export function getSessionTranscript(memoryPath: string, date: string): SessionEntry[] {
  const filePath = join(memoryPath, 'sessions', `${date}.jsonl`);
  if (!existsSync(filePath)) return [];

  const content = readFileSync(filePath, 'utf-8');
  const entries: SessionEntry[] = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      entries.push(JSON.parse(trimmed) as SessionEntry);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}
