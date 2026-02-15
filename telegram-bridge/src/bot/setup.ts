import { Telegraf } from 'telegraf';
import { Config } from '../types';
import { registerHandlers } from './handlers';
import { createAuthMiddleware, createRateLimitMiddleware } from './middleware';

export function setupBot(config: Config): Telegraf {
  const bot = new Telegraf(config.telegramBotToken);

  // Apply middleware
  bot.use(createAuthMiddleware(config));
  bot.use(createRateLimitMiddleware());

  // Register all handlers
  registerHandlers(bot, config);

  return bot;
}
