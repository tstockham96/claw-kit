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
