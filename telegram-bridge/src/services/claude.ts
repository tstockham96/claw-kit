import Anthropic from '@anthropic-ai/sdk';
import { Config, MemoryContext, ConversationMessage } from '../types';

export class ClaudeService {
  private client: Anthropic;
  private config: Config;

  constructor(config: Config) {
    this.client = new Anthropic({ apiKey: config.anthropicApiKey });
    this.config = config;
  }

  async chat(
    userMessage: string,
    memory: MemoryContext,
    conversationHistory: ConversationMessage[],
  ): Promise<string> {
    const systemPrompt = this.buildSystemPrompt(memory);

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

  private buildSystemPrompt(memory: MemoryContext): string {
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
