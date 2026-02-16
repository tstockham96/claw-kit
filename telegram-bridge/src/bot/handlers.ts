import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { Config, AgentProgressEvent } from '../types';
import { ClaudeService } from '../services/claude';
import { AgentService } from '../services/agent';
import { MemoryService } from '../services/memory';
import { ConversationService } from '../services/conversation';
import { shouldRespondInGroup } from './groups';

const TELEGRAM_MAX_LENGTH = 4096;
const STREAM_UPDATE_INTERVAL_MS = 1200; // How often to push edits to Telegram
const STREAM_CURSOR = ' ▍'; // Blinking cursor effect while streaming

// Track recent group messages for classifier context
const groupMessageHistory = new Map<number, string[]>();
const MAX_GROUP_HISTORY = 10;

function splitMessage(text: string): string[] {
  if (text.length <= TELEGRAM_MAX_LENGTH) return [text];

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= TELEGRAM_MAX_LENGTH) {
      parts.push(remaining);
      break;
    }

    // Try to split at a natural boundary
    let splitIndex = remaining.lastIndexOf('\n\n', TELEGRAM_MAX_LENGTH);
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_LENGTH / 2) {
      splitIndex = remaining.lastIndexOf('\n', TELEGRAM_MAX_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_LENGTH / 2) {
      splitIndex = remaining.lastIndexOf('. ', TELEGRAM_MAX_LENGTH);
    }
    if (splitIndex === -1 || splitIndex < TELEGRAM_MAX_LENGTH / 2) {
      splitIndex = TELEGRAM_MAX_LENGTH;
    }

    parts.push(remaining.substring(0, splitIndex));
    remaining = remaining.substring(splitIndex).trimStart();
  }

  return parts;
}

async function sendLongMessage(ctx: Context, text: string): Promise<void> {
  const parts = splitMessage(text);
  for (const part of parts) {
    await ctx.reply(part);
  }
}

function isGroupChat(ctx: Context): boolean {
  return ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
}

function trackGroupMessage(chatId: number, senderName: string, text: string): void {
  const history = groupMessageHistory.get(chatId) || [];
  history.push(`${senderName}: ${text}`);
  if (history.length > MAX_GROUP_HISTORY) {
    history.shift();
  }
  groupMessageHistory.set(chatId, history);
}

/**
 * Manages a streaming Telegram message that updates as text arrives.
 * Accumulates text chunks and periodically edits the Telegram message
 * to show the latest content, similar to the CLI streaming experience.
 */
class StreamingMessage {
  private chatId: number;
  private telegram: Context['telegram'];
  private messageId: number | null = null;
  private accumulated = '';
  private lastSent = '';
  private updateTimer: ReturnType<typeof setInterval> | null = null;
  private typingTimer: ReturnType<typeof setInterval> | null = null;
  private finished = false;
  /** Agent mode status lines shown above the streaming text */
  private statusLines: string[] = [];

  constructor(chatId: number, telegram: Context['telegram']) {
    this.chatId = chatId;
    this.telegram = telegram;
  }

  /** Start the streaming message with an initial placeholder */
  async start(initialText: string = '...'): Promise<void> {
    const msg = await this.telegram.sendMessage(this.chatId, initialText);
    this.messageId = msg.message_id;

    // Keep typing indicator alive
    this.typingTimer = setInterval(() => {
      this.telegram.sendChatAction(this.chatId, 'typing').catch(() => {});
    }, 4000);

    // Periodically flush accumulated text to the Telegram message
    this.updateTimer = setInterval(() => this.flush(), STREAM_UPDATE_INTERVAL_MS);
  }

  /** Append a text chunk (called from streaming callbacks) */
  push(chunk: string): void {
    this.accumulated += chunk;
  }

  /** Record a tool-use status line (agent mode) */
  addStatus(line: string): void {
    this.statusLines.push(line);
    // Keep only the 3 most recent
    if (this.statusLines.length > 3) {
      this.statusLines = this.statusLines.slice(-3);
    }
  }

  /** Flush the current accumulated text to Telegram */
  private async flush(): Promise<void> {
    if (!this.messageId || this.finished) return;

    let displayText: string;
    if (this.accumulated.length === 0 && this.statusLines.length > 0) {
      // No response text yet, just show status
      displayText = this.statusLines.join('\n');
    } else if (this.accumulated.length === 0) {
      return; // Nothing to show
    } else {
      // Show status (if any) + streamed text + cursor
      const prefix = this.statusLines.length > 0
        ? this.statusLines.join('\n') + '\n\n'
        : '';
      displayText = prefix + this.accumulated + STREAM_CURSOR;
    }

    // Telegram rejects edits with identical text
    if (displayText === this.lastSent) return;

    // Truncate to Telegram's limit
    if (displayText.length > TELEGRAM_MAX_LENGTH) {
      displayText = displayText.substring(0, TELEGRAM_MAX_LENGTH - 4) + '...';
    }

    try {
      await this.telegram.editMessageText(
        this.chatId, this.messageId, undefined, displayText,
      );
      this.lastSent = displayText;
    } catch {
      // Edit can fail if text hasn't changed or message was deleted
    }
  }

  /**
   * Finalize the message with the complete response text.
   * Stops all timers and does a final edit with the full content.
   * Returns any overflow text that didn't fit in the first message.
   */
  async finish(finalText: string): Promise<string | null> {
    this.finished = true;
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.typingTimer) clearInterval(this.typingTimer);

    if (!this.messageId) return finalText;

    // If the final text fits in one message, edit it in place
    if (finalText.length <= TELEGRAM_MAX_LENGTH) {
      try {
        await this.telegram.editMessageText(
          this.chatId, this.messageId, undefined, finalText,
        );
      } catch {
        // If edit fails, send as new message
        return finalText;
      }
      return null;
    }

    // Text is too long: put the first chunk in the existing message,
    // return the rest for the caller to send as follow-up messages
    const splitIndex = findSplitPoint(finalText, TELEGRAM_MAX_LENGTH);
    const first = finalText.substring(0, splitIndex);
    const rest = finalText.substring(splitIndex).trimStart();

    try {
      await this.telegram.editMessageText(
        this.chatId, this.messageId, undefined, first,
      );
    } catch {
      return finalText; // Send the whole thing as new messages
    }

    return rest.length > 0 ? rest : null;
  }

  /** Clean up timers if something goes wrong */
  cleanup(): void {
    this.finished = true;
    if (this.updateTimer) clearInterval(this.updateTimer);
    if (this.typingTimer) clearInterval(this.typingTimer);
  }
}

/** Find a natural split point in text near the target length */
function findSplitPoint(text: string, maxLen: number): number {
  if (text.length <= maxLen) return text.length;
  let idx = text.lastIndexOf('\n\n', maxLen);
  if (idx === -1 || idx < maxLen / 2) idx = text.lastIndexOf('\n', maxLen);
  if (idx === -1 || idx < maxLen / 2) idx = text.lastIndexOf('. ', maxLen);
  if (idx === -1 || idx < maxLen / 2) idx = maxLen;
  return idx;
}

export function registerHandlers(bot: Telegraf, config: Config): void {
  const claude = new ClaudeService(config);
  const agent = config.agentMode ? new AgentService(config) : null;
  const memory = new MemoryService(config.memoryPath);
  const conversations = new ConversationService(config);

  // Check agent availability at startup (non-blocking)
  if (agent) {
    agent.isAvailable().then(available => {
      if (available) {
        console.log('Agent mode enabled — messages will be processed through Claude Code SDK');
      } else {
        console.log('Agent mode requested but SDK not available — falling back to direct API');
      }
    }).catch(() => {
      console.log('Agent mode requested but SDK check failed — falling back to direct API');
    });
  }

  // /start command
  bot.start(async (ctx) => {
    const name = ctx.from.first_name || 'there';
    await ctx.reply(
      `Hey ${name}! I'm your Claw Kit AI assistant, powered by Claude.\n\n` +
      `You can just chat with me naturally, or use these commands:\n\n` +
      `/status - See what I know and remember\n` +
      `/remember <thing> - Save something to memory\n` +
      `/forget <thing> - Remove something from memory\n` +
      `/clear - Clear conversation context\n` +
      `/help - Show all commands\n\n` +
      `I have access to your memory files, so I'll remember context across conversations.`
    );
  });

  // /help command
  bot.help(async (ctx) => {
    await ctx.reply(
      `*Available Commands*\n\n` +
      `/start - Welcome message\n` +
      `/status - Memory status overview\n` +
      `/remember <thing> - Save to memory\n` +
      `/forget <thing> - Remove from memory\n` +
      `/clear - Clear conversation history\n` +
      `/help - This message\n\n` +
      `Or just send me a message and I'll chat with you using Claude!`,
      { parse_mode: 'Markdown' }
    );
  });

  // /status command
  bot.command('status', async (ctx) => {
    try {
      const memoryContext = await memory.loadContext();

      const sections: string[] = [];

      if (memoryContext.identity) {
        const lines = memoryContext.identity.split('\n').filter(l => l.trim()).slice(0, 3);
        sections.push(`*Identity:* ${lines.join(', ').substring(0, 200)}`);
      }
      if (memoryContext.user) {
        const lines = memoryContext.user.split('\n').filter(l => l.trim()).slice(0, 3);
        sections.push(`*User:* ${lines.join(', ').substring(0, 200)}`);
      }
      if (memoryContext.longTerm) {
        const lineCount = memoryContext.longTerm.split('\n').filter(l => l.trim()).length;
        sections.push(`*Long-term memory:* ${lineCount} entries`);
      }
      if (memoryContext.preferences) {
        const lineCount = memoryContext.preferences.split('\n').filter(l => l.trim()).length;
        sections.push(`*Preferences:* ${lineCount} entries`);
      }
      if (memoryContext.learnings) {
        const lineCount = memoryContext.learnings.split('\n').filter(l => l.trim()).length;
        sections.push(`*Learnings:* ${lineCount} entries`);
      }
      if (memoryContext.todayJournal) {
        sections.push(`*Today's journal:* Active`);
      }
      if (memoryContext.projectsIndex) {
        const lineCount = memoryContext.projectsIndex.split('\n').filter(l => l.trim()).length;
        sections.push(`*Projects:* ${lineCount} indexed`);
      }
      if (memoryContext.peopleIndex) {
        const lineCount = memoryContext.peopleIndex.split('\n').filter(l => l.trim()).length;
        sections.push(`*People:* ${lineCount} indexed`);
      }

      // Include search index stats if available
      const searchStats = claude.getSearchStats();
      if (searchStats) {
        sections.push(`\n*Search Index:* ${searchStats.totalChunks} chunks across ${searchStats.totalFiles} files`);
      } else {
        sections.push(`\n*Search Index:* Not available (run \`claw-search index\` to build)`);
      }

      if (sections.length === 0) {
        await ctx.reply('No memory files found yet. Start chatting and use /remember to build up my memory!');
      } else {
        await ctx.reply(`*Memory Status*\n\n${sections.join('\n')}`, { parse_mode: 'Markdown' });
      }
    } catch (err) {
      console.error('Error in /status:', err);
      await ctx.reply('Failed to load memory status. Check that the memory path is configured correctly.');
    }
  });

  // /remember command
  bot.command('remember', async (ctx) => {
    const text = ctx.message.text.replace(/^\/remember\s*/, '').trim();

    if (!text) {
      await ctx.reply('Usage: /remember <something to remember>\n\nExamples:\n/remember I prefer dark mode\n/remember Meeting with Alex on Friday');
      return;
    }

    try {
      // Route to the appropriate memory file based on content
      const target = classifyMemoryTarget(text);
      await memory.appendToFile(target.file, target.formatted);

      // Also log to journal
      await memory.appendToJournal(`[Telegram] Remembered: ${text}`);

      await ctx.reply(`Got it! Saved to ${target.label}.`);
    } catch (err) {
      console.error('Error in /remember:', err);
      await ctx.reply('Failed to save to memory. Please try again.');
    }
  });

  // /forget command
  bot.command('forget', async (ctx) => {
    const text = ctx.message.text.replace(/^\/forget\s*/, '').trim();

    if (!text) {
      await ctx.reply('Usage: /forget <something to remove>\n\nI\'ll search my memory files and remove matching entries.');
      return;
    }

    try {
      const results = await memory.searchMemory(text);

      if (results.length === 0) {
        await ctx.reply(`I couldn't find anything matching "${text}" in my memory.`);
        return;
      }

      let removed = false;
      for (const result of results) {
        const success = await memory.removeFromFile(result.file, text);
        if (success) removed = true;
      }

      if (removed) {
        await memory.appendToJournal(`[Telegram] Forgot: ${text}`);
        await ctx.reply(`Done! Removed entries matching "${text}" from memory.`);
      } else {
        await ctx.reply(`Found "${text}" in memory but couldn't remove it cleanly. You may want to edit the files directly.`);
      }
    } catch (err) {
      console.error('Error in /forget:', err);
      await ctx.reply('Failed to search/remove from memory. Please try again.');
    }
  });

  // /clear command
  bot.command('clear', async (ctx) => {
    const chatId = ctx.chat.id;
    await conversations.clearContext(chatId);
    await ctx.reply('Conversation history cleared! Starting fresh.');
  });

  // Text message handler
  bot.on(message('text'), async (ctx) => {
    const chatId = ctx.chat.id;
    const userMessage = ctx.message.text;
    const senderName = ctx.from.first_name || ctx.from.username || 'User';

    // Group chat handling
    if (isGroupChat(ctx)) {
      if (!config.groupChatEnabled) return;

      trackGroupMessage(chatId, senderName, userMessage);

      try {
        const botInfo = await ctx.telegram.getMe();
        const botUsername = botInfo.username || '';
        const recentMessages = groupMessageHistory.get(chatId) || [];

        const shouldRespond = await shouldRespondInGroup(
          config,
          botUsername,
          userMessage,
          senderName,
          recentMessages,
        );

        if (!shouldRespond) return;
      } catch (err) {
        console.error('Error in group classifier:', err);
        return; // When in doubt in groups, stay quiet
      }
    }

    // Show typing indicator
    await ctx.sendChatAction('typing');

    try {
      // Determine whether to use Agent SDK or direct API
      const useAgent = agent && await agent.isAvailable();

      // Load context: use core context (search-enhanced) if search is available,
      // otherwise fall back to loading all memory files
      const searchAvailable = claude.isSearchAvailable();

      const [context, history] = await Promise.all([
        searchAvailable ? memory.loadCoreContext() : memory.loadContext(),
        conversations.getContext(chatId),
      ]);

      // Set up a streaming message that updates in real time
      const stream = new StreamingMessage(chatId, ctx.telegram);
      let response: string;

      try {
        if (useAgent) {
          // Agent mode: show tool activity + streaming text
          await stream.start('Working on it...');

          const onProgress = (event: AgentProgressEvent) => {
            if (event.type === 'tool_start') stream.addStatus(event.summary);
          };
          const onText = (chunk: string) => stream.push(chunk);

          response = await agent.chat(userMessage, context, senderName, onProgress, onText);
        } else {
          // Direct API mode: stream the response text live
          await stream.start('...');

          const onText = (chunk: string) => stream.push(chunk);
          response = await claude.chat(userMessage, context, history, onText);
        }

        // Finalize: replace the streaming message with the clean final text
        const overflow = await stream.finish(response);
        if (overflow) {
          await sendLongMessage(ctx, overflow);
        }
      } catch (err) {
        stream.cleanup();
        throw err;
      }

      // Store the exchange in conversation history
      await conversations.addMessage(chatId, 'user', userMessage);
      await conversations.addMessage(chatId, 'assistant', response);

      // Log session entries for search indexing (non-blocking)
      memory.logSessionEntry('user', userMessage, 'telegram').catch(err => {
        console.error('Error logging user session entry:', err);
      });
      memory.logSessionEntry('assistant', response, 'telegram').catch(err => {
        console.error('Error logging assistant session entry:', err);
      });

      // Journal significant interactions (longer exchanges, not just greetings)
      if (userMessage.length > 50 || response.length > 200) {
        const summary = userMessage.length > 100
          ? userMessage.substring(0, 100) + '...'
          : userMessage;
        await memory.appendToJournal(
          `[Telegram chat] User: ${summary}\nAssistant responded (${response.length} chars)`
        );
      }
    } catch (err) {
      console.error('Error handling message:', err);

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';

      if (errorMessage.includes('rate_limit') || errorMessage.includes('429')) {
        await ctx.reply('I\'m being rate-limited by the API. Please wait a moment and try again.');
      } else if (errorMessage.includes('authentication') || errorMessage.includes('401')) {
        await ctx.reply('API authentication error. Please check the ANTHROPIC_API_KEY configuration.');
      } else {
        await ctx.reply('Sorry, something went wrong. Please try again.');
      }
    }
  });

  // Periodic conversation cleanup (every hour)
  setInterval(() => {
    conversations.cleanup().catch(err => {
      console.error('Error during conversation cleanup:', err);
    });
  }, 60 * 60 * 1000);
}

interface MemoryTarget {
  file: string;
  label: string;
  formatted: string;
}

function classifyMemoryTarget(text: string): MemoryTarget {
  const lower = text.toLowerCase();
  const today = new Date().toISOString().split('T')[0];

  // Check for preference-related keywords
  if (lower.includes('prefer') || lower.includes('like') || lower.includes('don\'t like') ||
      lower.includes('favorite') || lower.includes('favourite') || lower.includes('want') ||
      lower.includes('style') || lower.includes('mode')) {
    return {
      file: 'preferences.md',
      label: 'preferences',
      formatted: `- ${text} (${today})`,
    };
  }

  // Check for learning-related keywords
  if (lower.includes('learned') || lower.includes('realized') || lower.includes('discovered') ||
      lower.includes('figured out') || lower.includes('turns out') || lower.includes('til ') ||
      lower.includes('today i learned')) {
    return {
      file: 'learnings.md',
      label: 'learnings',
      formatted: `- ${text} (${today})`,
    };
  }

  // Check for decision-related keywords
  if (lower.includes('decided') || lower.includes('decision') || lower.includes('chose') ||
      lower.includes('going with') || lower.includes('we\'ll use') || lower.includes('settled on')) {
    const slug = text.substring(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    return {
      file: `decisions/${today}-${slug}.md`,
      label: 'decisions',
      formatted: `# Decision: ${text}\n\n**Date:** ${today}\n**Status:** Decided\n\n## Decision\n${text}`,
    };
  }

  // Check for people-related keywords
  if (lower.includes('meeting with') || lower.includes('talked to') || lower.includes('spoke with') ||
      lower.includes('email from') || lower.includes('call with') || lower.includes(' is my ') ||
      lower.includes(' works at') || lower.includes(' their number') || lower.includes(' their email')) {
    // Extract name heuristic: first capitalized word(s) after relational keyword
    return {
      file: 'people/_index.md',
      label: 'people',
      formatted: `- ${text} (${today})`,
    };
  }

  // Check for project-related keywords
  if (lower.includes('project') || lower.includes('working on') || lower.includes('building') ||
      lower.includes('shipping') || lower.includes('launched') || lower.includes('repo') ||
      lower.includes('codebase') || lower.includes('deploy')) {
    return {
      file: 'projects/_index.md',
      label: 'projects',
      formatted: `- ${text} (${today})`,
    };
  }

  // Default to long-term memory
  return {
    file: 'long-term.md',
    label: 'long-term memory',
    formatted: `- ${text} (${today})`,
  };
}
