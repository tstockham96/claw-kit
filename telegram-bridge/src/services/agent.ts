import { Config, CoreContext, MemoryContext, AgentProgressCallback } from '../types';
import { SearchService, TelegramSearchResult } from './search';

// Dangerous bash patterns to block (defense-in-depth)
const BLOCKED_BASH_PATTERNS = [
  /rm\s+-rf\s+\/(?:\s|$)/,       // rm -rf /
  /rm\s+-rf\s+~(?:\s|$|\/)/,     // rm -rf ~ or rm -rf ~/
  /mkfs\b/,                       // mkfs (format disks)
  /dd\s+if=/,                     // dd if= (raw disk write)
  /:\(\)\s*\{\s*:\|:&\s*\}\s*;:/, // fork bomb
  />\s*\/dev\/sd/,                 // overwrite disk devices
  />\s*\/dev\/nvme/,               // overwrite nvme devices
];

// Paths that should never be modified
const BLOCKED_PATH_PREFIXES = ['/etc/', '/usr/', '/System/', '/sbin/', '/bin/'];

// Piping remote content to shell
const PIPE_TO_SHELL_PATTERN = /(?:curl|wget)\s.*\|\s*(?:ba)?sh/;

/**
 * Check whether a bash command should be blocked for safety.
 */
function isDangerousBashCommand(command: string): boolean {
  for (const pattern of BLOCKED_BASH_PATTERNS) {
    if (pattern.test(command)) return true;
  }
  if (PIPE_TO_SHELL_PATTERN.test(command)) return true;
  for (const prefix of BLOCKED_PATH_PREFIXES) {
    // Block commands that write to system paths (rough heuristic)
    if (command.includes(prefix) && /(?:rm|mv|cp|chmod|chown|>|tee)\b/.test(command)) {
      return true;
    }
  }
  return false;
}

/**
 * AgentService wraps the Claude Agent SDK to process Telegram messages
 * through Claude Code with full tool access.
 */
export class AgentService {
  private config: Config;
  private searchService: SearchService;
  private sdkAvailable: boolean | null = null;

  constructor(config: Config) {
    this.config = config;
    this.searchService = new SearchService(config.memoryPath);
  }

  /**
   * Check if the Claude Agent SDK is available for use.
   * Caches the result after the first check.
   */
  async isAvailable(): Promise<boolean> {
    if (this.sdkAvailable !== null) return this.sdkAvailable;

    try {
      await import('@anthropic-ai/claude-agent-sdk');
      this.sdkAvailable = true;
    } catch {
      console.warn('Claude Agent SDK not available — falling back to direct API');
      this.sdkAvailable = false;
    }
    return this.sdkAvailable;
  }

  /**
   * Send a message through Claude Code via the Agent SDK and collect the response.
   * Optionally fires progress callbacks as tools are used.
   */
  async chat(
    userMessage: string,
    context: CoreContext | MemoryContext,
    userName: string = 'User',
    onProgress?: AgentProgressCallback,
  ): Promise<string> {
    const sdk = await import('@anthropic-ai/claude-agent-sdk');
    const { query } = sdk;

    // Build the prompt with context prefix
    const prompt = this.buildPrompt(userMessage, context, userName);

    const textParts: string[] = [];

    try {
      const stream = query({
        prompt,
        options: {
          cwd: this.config.agentCwd,
          model: this.config.chatModel,
          allowedTools: this.config.agentAllowedTools,
          maxTurns: this.config.agentMaxTurns,
          settingSources: ['project'],
          systemPrompt: {
            type: 'preset',
            preset: 'claude_code',
            append: [
              'You are responding to a Telegram message. Keep responses conversational and concise.',
              'Use Telegram-friendly formatting (bold with *text*, italic with _text_, code with `code`).',
              'Be natural, this is a chat, not a document.',
            ].join('\n'),
          },
          permissionMode: 'default',
          canUseTool: async (toolName, input) => {
            // Block dangerous bash commands
            if (toolName === 'Bash' && typeof input.command === 'string') {
              if (isDangerousBashCommand(input.command)) {
                return {
                  behavior: 'deny' as const,
                  message: `Blocked dangerous command: ${input.command.substring(0, 100)}`,
                };
              }
            }
            // Allow all other tool uses in the allowed set
            return { behavior: 'allow' as const };
          },
          persistSession: false,
        },
      });

      for await (const message of stream) {
        if (message.type === 'assistant') {
          // Fire progress for tool use blocks (tool_start)
          if (onProgress) {
            for (const block of message.message.content) {
              if ('type' in block && block.type === 'tool_use') {
                const toolBlock = block as { name?: string; input?: Record<string, unknown> };
                onProgress({
                  type: 'tool_start',
                  toolName: toolBlock.name,
                  summary: describeToolUse(toolBlock.name, toolBlock.input),
                });
              }
            }
          }

          for (const block of message.message.content) {
            if ('text' in block && typeof block.text === 'string') {
              textParts.push(block.text);
            }
          }
        }
        if (message.type === 'result') {
          if (message.subtype === 'success' && message.result) {
            // The final result is the authoritative output
            return message.result;
          }
          if (message.subtype !== 'success') {
            // Error result: return whatever text we collected, or a generic error
            if (textParts.length > 0) {
              return textParts.join('\n');
            }
            return 'Sorry, something went wrong while processing your message.';
          }
        }
      }
    } catch (err) {
      console.error('Agent SDK error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      return `Agent mode encountered an error: ${errorMessage}`;
    }

    // If we got text but no result message, return the collected text
    if (textParts.length > 0) {
      return textParts.join('\n');
    }

    return 'No response generated.';
  }

  /**
   * Build the prompt to send to Claude Code, including memory context
   * and search results as a prefix to the user's message.
   */
  private buildPrompt(
    userMessage: string,
    context: CoreContext | MemoryContext,
    userName: string,
  ): string {
    const parts: string[] = [];

    // Add memory context
    if (context.identity) {
      parts.push(`[Identity context]\n${context.identity}`);
    }
    if (context.user) {
      parts.push(`[User context]\n${context.user}`);
    }
    if (context.todayJournal) {
      parts.push(`[Today's activity]\n${context.todayJournal}`);
    }

    // Add search results if search is available
    const searchResults = this.searchService.search(userMessage, 8);
    if (searchResults.length > 0) {
      parts.push(this.formatSearchResults(searchResults));
    }

    // Add the actual user message
    parts.push(`[Telegram message from ${userName}]\n${userMessage}`);

    return parts.join('\n\n');
  }

  /**
   * Format search results into a context block.
   */
  private formatSearchResults(results: TelegramSearchResult[]): string {
    const lines = ['[Relevant memory from search]'];
    for (const result of results) {
      lines.push(`Source: ${result.path} (lines ${result.startLine}-${result.endLine}, relevance: ${result.score.toFixed(2)})`);
      lines.push(`> ${result.snippet}`);
      lines.push('');
    }
    return lines.join('\n');
  }
}

/**
 * Produce a short, human-readable description of a tool invocation.
 */
function describeToolUse(toolName?: string, input?: Record<string, unknown>): string {
  if (!toolName) return 'Working...';

  switch (toolName) {
    case 'Bash': {
      const cmd = typeof input?.command === 'string' ? input.command : '';
      const short = cmd.length > 60 ? cmd.substring(0, 57) + '...' : cmd;
      return short ? `Running: \`${short}\`` : 'Running a command';
    }
    case 'Read': {
      const file = typeof input?.file_path === 'string' ? input.file_path.split('/').pop() : '';
      return file ? `Reading ${file}` : 'Reading a file';
    }
    case 'Write': {
      const file = typeof input?.file_path === 'string' ? input.file_path.split('/').pop() : '';
      return file ? `Writing ${file}` : 'Writing a file';
    }
    case 'Edit': {
      const file = typeof input?.file_path === 'string' ? input.file_path.split('/').pop() : '';
      return file ? `Editing ${file}` : 'Editing a file';
    }
    case 'Glob':
      return `Searching for files`;
    case 'Grep': {
      const pattern = typeof input?.pattern === 'string' ? input.pattern : '';
      const short = pattern.length > 40 ? pattern.substring(0, 37) + '...' : pattern;
      return short ? `Searching for "${short}"` : 'Searching code';
    }
    default:
      return `Using ${toolName}`;
  }
}
