export interface Config {
  telegramBotToken: string;
  anthropicApiKey: string;
  memoryPath: string;
  chatModel: string;
  classifierModel: string;
  maxContextMessages: number;
  allowedUsers: number[];
  groupChatEnabled: boolean;
  port: number;
  /** Enable Claude Agent SDK mode for full tool access (Bash, Read, Write, etc.) */
  agentMode: boolean;
  /** Working directory for Claude Code when in agent mode (default: parent of telegram-bridge) */
  agentCwd: string;
  /** Max agentic turns per message in agent mode (default: 25) */
  agentMaxTurns: number;
  /** Allowed tools in agent mode (default: safe set) */
  agentAllowedTools: string[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface ConversationContext {
  chatId: number;
  messages: ConversationMessage[];
  lastActivity: number;
}

export interface MemoryContext {
  identity: string;
  user: string;
  longTerm: string;
  preferences: string;
  learnings: string;
  todayJournal: string;
  yesterdayJournal: string;
  projectsIndex: string;
  peopleIndex: string;
}

export interface CoreContext {
  identity: string;
  user: string;
  todayJournal: string;
}

/** Progress callback fired during agent execution */
export type AgentProgressCallback = (event: AgentProgressEvent) => void;

export interface AgentProgressEvent {
  type: 'tool_start' | 'tool_end' | 'thinking';
  toolName?: string;
  /** Brief human-readable description of what's happening */
  summary: string;
}
