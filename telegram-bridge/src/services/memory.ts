import { readFile, writeFile, readdir, mkdir, appendFile } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { MemoryContext, CoreContext } from '../types';

export class MemoryService {
  private basePath: string;

  constructor(memoryPath: string) {
    // Resolve relative to the telegram-bridge directory
    this.basePath = resolve(__dirname, '../../', memoryPath);
  }

  /** Validate that a resolved path stays within the memory directory */
  private validatePath(fileName: string): string {
    const resolved = resolve(join(this.basePath, fileName));
    if (!resolved.startsWith(this.basePath)) {
      throw new Error(`Path traversal blocked: ${fileName}`);
    }
    return resolved;
  }

  private async safeRead(filePath: string): Promise<string> {
    try {
      return await readFile(filePath, 'utf-8');
    } catch {
      return '';
    }
  }

  private getDateStr(date: Date = new Date()): string {
    return date.toISOString().split('T')[0];
  }

  async loadContext(): Promise<MemoryContext> {
    const today = this.getDateStr();
    const yesterday = this.getDateStr(new Date(Date.now() - 86400000));

    const [identity, user, longTerm, preferences, learnings, todayJournal, yesterdayJournal, projectsIndex, peopleIndex] = await Promise.all([
      this.safeRead(join(this.basePath, 'identity.md')),
      this.safeRead(join(this.basePath, 'user.md')),
      this.safeRead(join(this.basePath, 'long-term.md')),
      this.safeRead(join(this.basePath, 'preferences.md')),
      this.safeRead(join(this.basePath, 'learnings.md')),
      this.safeRead(join(this.basePath, 'journal', `${today}.md`)),
      this.safeRead(join(this.basePath, 'journal', `${yesterday}.md`)),
      this.safeRead(join(this.basePath, 'projects', '_index.md')),
      this.safeRead(join(this.basePath, 'people', '_index.md')),
    ]);

    return { identity, user, longTerm, preferences, learnings, todayJournal, yesterdayJournal, projectsIndex, peopleIndex };
  }

  /**
   * Load only the core context files (identity, user, today's journal).
   * The rest of the context comes from the search engine.
   */
  async loadCoreContext(): Promise<CoreContext> {
    const today = this.getDateStr();
    const [identity, user, todayJournal] = await Promise.all([
      this.safeRead(join(this.basePath, 'identity.md')),
      this.safeRead(join(this.basePath, 'user.md')),
      this.safeRead(join(this.basePath, 'journal', `${today}.md`)),
    ]);
    return { identity, user, todayJournal };
  }

  /**
   * Log a session entry (user or assistant message) for search indexing.
   * Stored as JSONL in the sessions directory under the memory path.
   */
  async logSessionEntry(role: string, content: string, source: string = 'telegram'): Promise<void> {
    const today = this.getDateStr();
    const sessionsDir = join(this.basePath, 'sessions');
    if (!existsSync(sessionsDir)) {
      await mkdir(sessionsDir, { recursive: true });
    }

    const sessionFile = join(sessionsDir, `${today}.jsonl`);
    const entry = JSON.stringify({
      timestamp: Date.now(),
      date: new Date().toISOString(),
      role,
      content: content.substring(0, 2000), // cap stored content
      source,
    });

    await appendFile(sessionFile, entry + '\n', 'utf-8');
  }

  async appendToJournal(entry: string): Promise<void> {
    const today = this.getDateStr();
    const journalDir = join(this.basePath, 'journal');
    const journalPath = join(journalDir, `${today}.md`);

    if (!existsSync(journalDir)) {
      await mkdir(journalDir, { recursive: true });
    }

    const existing = await this.safeRead(journalPath);
    const timestamp = new Date().toLocaleTimeString();
    const newContent = existing
      ? `${existing}\n\n## ${timestamp}\n${entry}`
      : `# Journal — ${today}\n\n## ${timestamp}\n${entry}`;

    await writeFile(journalPath, newContent, 'utf-8');
  }

  async appendToFile(fileName: string, content: string): Promise<void> {
    const filePath = this.validatePath(fileName);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const existing = await this.safeRead(filePath);
    const newContent = existing ? `${existing}\n${content}` : content;
    await writeFile(filePath, newContent, 'utf-8');
  }

  async readMemoryFile(fileName: string): Promise<string> {
    return this.safeRead(this.validatePath(fileName));
  }

  async writeMemoryFile(fileName: string, content: string): Promise<void> {
    const filePath = this.validatePath(fileName);
    const dir = filePath.substring(0, filePath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    await writeFile(filePath, content, 'utf-8');
  }

  async searchMemory(query: string): Promise<Array<{ file: string; content: string }>> {
    const results: Array<{ file: string; content: string }> = [];
    const searchLower = query.toLowerCase();

    // Search main memory files
    const files = ['long-term.md', 'preferences.md', 'learnings.md', 'identity.md', 'user.md'];
    for (const file of files) {
      const content = await this.safeRead(join(this.basePath, file));
      if (content.toLowerCase().includes(searchLower)) {
        results.push({ file, content });
      }
    }

    // Search people directory
    await this.searchDirectory('people', searchLower, results);

    // Search projects directory
    await this.searchDirectory('projects', searchLower, results);

    // Search decisions directory
    await this.searchDirectory('decisions', searchLower, results);

    // Search journal directory
    await this.searchDirectory('journal', searchLower, results);

    return results;
  }

  private async searchDirectory(dir: string, query: string, results: Array<{ file: string; content: string }>): Promise<void> {
    const dirPath = join(this.basePath, dir);
    try {
      const entries = await readdir(dirPath);
      for (const entry of entries) {
        if (entry === '.gitkeep') continue;
        const content = await this.safeRead(join(dirPath, entry));
        if (content.toLowerCase().includes(query)) {
          results.push({ file: `${dir}/${entry}`, content });
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  async removeFromFile(fileName: string, contentToRemove: string): Promise<boolean> {
    const filePath = this.validatePath(fileName);
    const content = await this.safeRead(filePath);
    if (!content) return false;

    // Remove lines containing the content
    const lines = content.split('\n');
    const filtered = lines.filter(line => !line.toLowerCase().includes(contentToRemove.toLowerCase()));

    if (filtered.length === lines.length) return false;

    await writeFile(filePath, filtered.join('\n'), 'utf-8');
    return true;
  }
}
