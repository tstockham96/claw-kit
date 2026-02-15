import { Context, MiddlewareFn } from 'telegraf';
import { Config } from '../types';

export function createAuthMiddleware(config: Config): MiddlewareFn<Context> {
  return async (ctx, next) => {
    // If no allowed users configured, deny all (secure by default)
    if (config.allowedUsers.length === 0) {
      console.warn('ALLOWED_USERS is not set — bot will not respond to anyone. Configure ALLOWED_USERS in .env.');
      return;
    }

    const userId = ctx.from?.id;
    if (!userId || !config.allowedUsers.includes(userId)) {
      console.log(`Unauthorized access attempt from user ${userId}`);
      return; // Silently ignore unauthorized users
    }

    return next();
  };
}

export function createRateLimitMiddleware(): MiddlewareFn<Context> {
  const userTimestamps = new Map<number, number[]>();
  const MAX_REQUESTS = 20;
  const WINDOW_MS = 60_000; // 1 minute

  return async (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const now = Date.now();
    const timestamps = userTimestamps.get(userId) || [];
    const recent = timestamps.filter(t => now - t < WINDOW_MS);

    if (recent.length >= MAX_REQUESTS) {
      await ctx.reply('Slow down! Too many messages. Try again in a minute.');
      return;
    }

    recent.push(now);
    userTimestamps.set(userId, recent);

    return next();
  };
}
