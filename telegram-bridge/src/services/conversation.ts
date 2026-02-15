import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { ConversationContext, ConversationMessage, Config } from '../types';

export class ConversationService {
  private conversations: Map<number, ConversationContext> = new Map();
  private storagePath: string;
  private maxMessages: number;

  constructor(config: Config) {
    this.storagePath = resolve(__dirname, '../../conversations');
    this.maxMessages = config.maxContextMessages;
  }

  async getContext(chatId: number): Promise<ConversationMessage[]> {
    let context = this.conversations.get(chatId);

    if (!context) {
      context = await this.loadFromDisk(chatId);
      this.conversations.set(chatId, context);
    }

    return context.messages.slice(-this.maxMessages);
  }

  async addMessage(chatId: number, role: 'user' | 'assistant', content: string): Promise<void> {
    let context = this.conversations.get(chatId);

    if (!context) {
      context = { chatId, messages: [], lastActivity: Date.now() };
      this.conversations.set(chatId, context);
    }

    context.messages.push({ role, content, timestamp: Date.now() });
    context.lastActivity = Date.now();

    // Trim to max messages (keep double to avoid frequent disk writes)
    if (context.messages.length > this.maxMessages * 2) {
      context.messages = context.messages.slice(-this.maxMessages);
    }

    await this.saveToDisk(chatId, context);
  }

  async clearContext(chatId: number): Promise<void> {
    this.conversations.set(chatId, { chatId, messages: [], lastActivity: Date.now() });
    await this.saveToDisk(chatId, this.conversations.get(chatId)!);
  }

  private getFilePath(chatId: number): string {
    return join(this.storagePath, `chat_${chatId}.json`);
  }

  private async loadFromDisk(chatId: number): Promise<ConversationContext> {
    const filePath = this.getFilePath(chatId);
    try {
      const data = await readFile(filePath, 'utf-8');
      return JSON.parse(data) as ConversationContext;
    } catch {
      return { chatId, messages: [], lastActivity: Date.now() };
    }
  }

  private async saveToDisk(chatId: number, context: ConversationContext): Promise<void> {
    if (!existsSync(this.storagePath)) {
      await mkdir(this.storagePath, { recursive: true });
    }
    const filePath = this.getFilePath(chatId);
    await writeFile(filePath, JSON.stringify(context, null, 2), 'utf-8');
  }

  // Clean up old conversations (older than 7 days)
  async cleanup(): Promise<void> {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [chatId, context] of this.conversations) {
      if (context.lastActivity < cutoff) {
        this.conversations.delete(chatId);
      }
    }
  }
}
