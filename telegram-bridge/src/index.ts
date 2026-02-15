import 'dotenv/config';
import express from 'express';
import { setupBot } from './bot/setup';
import { Config } from './types';

function loadConfig(): Config {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required');

  return {
    telegramBotToken: token,
    anthropicApiKey: apiKey,
    memoryPath: process.env.MEMORY_PATH || '../kit/memory',
    chatModel: process.env.CHAT_MODEL || 'claude-sonnet-4-5-20250929',
    classifierModel: process.env.CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001',
    maxContextMessages: parseInt(process.env.MAX_CONTEXT_MESSAGES || '20', 10),
    allowedUsers: process.env.ALLOWED_USERS
      ? process.env.ALLOWED_USERS.split(',').map(id => parseInt(id.trim(), 10))
      : [],
    groupChatEnabled: process.env.GROUP_CHAT_ENABLED !== 'false',
    port: parseInt(process.env.PORT || '3000', 10),
  };
}

async function main() {
  const config = loadConfig();

  // Health check server
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));
  app.listen(config.port, () => {
    console.log(`Health check server running on port ${config.port}`);
  });

  // Start bot
  const bot = setupBot(config);

  // Graceful shutdown
  const shutdown = () => {
    console.log('Shutting down...');
    bot.stop('SIGTERM');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await bot.launch();
  console.log('Telegram bot is running!');
}

main().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});
