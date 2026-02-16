import { Telegraf } from 'telegraf';
import { Config } from '../types';
import { registerHandlers } from './handlers';
import { createAuthMiddleware, createRateLimitMiddleware } from './middleware';

export async function setupBot(config: Config): Promise<Telegraf> {
  const bot = new Telegraf(config.telegramBotToken);

  // Register slash commands with Telegram so they autocomplete when the user types "/"
  await bot.telegram.setMyCommands([
    { command: 'status', description: 'See what I know and remember' },
    { command: 'remember', description: 'Save something to memory' },
    { command: 'forget', description: 'Remove something from memory' },
    { command: 'clear', description: 'Clear conversation history' },
    { command: 'help', description: 'Show all commands' },
  ]);

  // Apply middleware
  bot.use(createAuthMiddleware(config));
  bot.use(createRateLimitMiddleware());

  // Register all handlers
  registerHandlers(bot, config);

  return bot;
}
