import Anthropic from '@anthropic-ai/sdk';
import { Config, MemoryContext, CoreContext, ConversationMessage } from '../types';
import { SearchService, TelegramSearchResult } from './search';

export class ClaudeService {
  private client: Anthropic;
  private config: Config;
  private searchService: SearchService;

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.config = config;
    this.searchService = new SearchService(config.memoryPath);
  }

  /**
   * Chat using search-enhanced context.
   * Core context (identity, user, journal) is always loaded.
   * Additional context is retrieved from the search index based on the user's message.
   * Falls back to full memory loading if search is unavailable.
   */
  async chat(
    userMessage: string,
    context: CoreContext | MemoryContext,
    conversationHistory: ConversationMessage[],
  ): Promise<string> {
    // Search for relevant context based on the user's message
    const searchResults = this.searchService.search(userMessage, 8);

    const systemPrompt = this.isCoreContext(context)
      ? this.buildSearchEnhancedPrompt(context, searchResults)
      : this.buildLegacyPrompt(context);

    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
      ...conversationHistory.map(msg => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: 'user' as const, content: userMessage },
    ];

    const response = await this.client.messages.create({
      model: this.config.chatModel,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
    });

    return response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map(block => block.text)
      .join('');
  }

  /**
   * Check if the search index is available.
   */
  isSearchAvailable(): boolean {
    return this.searchService.isAvailable();
  }

  /**
   * Get search index stats for /status reporting.
   */
  getSearchStats(): { totalChunks: number; totalFiles: number } | null {
    return this.searchService.getStats();
  }

  private isCoreContext(context: CoreContext | MemoryContext): context is CoreContext {
    return !('longTerm' in context);
  }

  /**
   * Build system prompt using search-enhanced context retrieval.
   * Only identity, user, and today's journal are loaded directly;
   * everything else comes from search results.
   */
  private buildSearchEnhancedPrompt(core: CoreContext, searchResults: TelegramSearchResult[]): string {
    let prompt = '';

    // Always include identity and user context
    if (core.identity) {
      prompt += `# Your Identity\n${core.identity}\n\n`;
    }
    if (core.user) {
      prompt += `# About the User\n${core.user}\n\n`;
    }

    // Include search results as relevant context
    if (searchResults.length > 0) {
      prompt += `# Relevant Memory\nThe following memory excerpts are relevant to this conversation:\n\n`;
      for (const result of searchResults) {
        prompt += `**Source: ${result.path}** (lines ${result.startLine}-${result.endLine}, relevance: ${result.score.toFixed(2)})\n`;
        prompt += `> ${result.snippet}\n\n`;
      }
    }

    // Include today's journal for recency
    if (core.todayJournal) {
      prompt += `# Today's Activity\n${core.todayJournal}\n\n`;
    }

    prompt += `# Instructions
You are chatting via Telegram. Keep responses conversational and concise.
Use Telegram-friendly formatting (bold with *text*, italic with _text_, code with \`code\`).
If you reference something from memory, include a brief citation: (Source: file#line).
Be natural — this is a chat, not a document.
If the user tells you something worth remembering, acknowledge it and note that it will be saved.`;

    return prompt;
  }

  /**
   * Legacy prompt builder for backward compatibility.
   * Used when the search index is not available.
   */
  private buildLegacyPrompt(memory: MemoryContext): string {
    let prompt = '';

    if (memory.identity) {
      prompt += `# Your Identity\n${memory.identity}\n\n`;
    }
    if (memory.user) {
      prompt += `# About the User\n${memory.user}\n\n`;
    }
    if (memory.preferences) {
      prompt += `# User Preferences\n${memory.preferences}\n\n`;
    }
    if (memory.longTerm) {
      prompt += `# Key Facts\n${memory.longTerm}\n\n`;
    }
    if (memory.learnings) {
      prompt += `# Learnings\n${memory.learnings}\n\n`;
    }
    if (memory.todayJournal) {
      prompt += `# Today's Journal\n${memory.todayJournal}\n\n`;
    }
    if (memory.yesterdayJournal) {
      prompt += `# Yesterday's Journal\n${memory.yesterdayJournal}\n\n`;
    }
    if (memory.projectsIndex) {
      prompt += `# Active Projects\n${memory.projectsIndex}\n\n`;
    }
    if (memory.peopleIndex) {
      prompt += `# Known People\n${memory.peopleIndex}\n\n`;
    }

    prompt += `# Instructions
You are chatting via Telegram. Keep responses conversational and concise.
Use Telegram-friendly formatting (bold with *text*, italic with _text_, code with \`code\`).
Don't use markdown headers in chat responses.
If the user asks you to remember something, acknowledge it and note that it will be saved.
Be natural — this is a chat, not a document.`;

    return prompt;
  }
}
