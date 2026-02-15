# Claw Kit Telegram Bridge

Chat with your Claude AI assistant via Telegram. The bridge connects a Telegram bot to the Anthropic API, with full access to your Claw Kit memory files for persistent context across conversations.

## Prerequisites

- Node.js 18+
- A Telegram bot token (get one from [@BotFather](https://t.me/BotFather) on Telegram)
- An Anthropic API key (get one from [console.anthropic.com](https://console.anthropic.com))

## Setup

1. Install dependencies:

```bash
cd telegram-bridge
npm install
```

2. Copy the environment template and fill in your tokens:

```bash
cp .env.example .env
```

Edit `.env` and add your `TELEGRAM_BOT_TOKEN` and `ANTHROPIC_API_KEY`.

3. Start the bot in development mode:

```bash
npm run dev
```

For production:

```bash
npm run build
npm start
```

## Bot Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message and quick intro |
| `/status` | Overview of loaded memory files |
| `/remember <thing>` | Save something to memory (auto-routes to the right file) |
| `/forget <thing>` | Search and remove something from memory |
| `/clear` | Clear conversation history for the current chat |
| `/help` | List available commands |

Any regular text message will be sent to Claude for a conversational response, with your full memory context included.

## Group Chat Behavior

When added to a Telegram group, the bot uses a lightweight classifier (Claude Haiku) to decide whether it should respond to each message. It will always respond when directly mentioned with `@botusername`. Otherwise, it evaluates whether it can add genuine value to the conversation.

Group chat support can be disabled by setting `GROUP_CHAT_ENABLED=false` in your `.env` file.

## Security

- **User allowlisting:** Set `ALLOWED_USERS` to a comma-separated list of Telegram user IDs to restrict access. When empty, all users are allowed.
- **Rate limiting:** Built-in rate limiter prevents abuse (20 messages per minute per user).
- **No always-on daemon:** The bot runs as a standard Node.js process; stop it anytime.
- **Official APIs only:** Uses the official Telegraf SDK and Anthropic SDK. No third-party proxies.

## Configuration

All configuration is done via environment variables (see `.env.example`):

| Variable | Default | Description |
|----------|---------|-------------|
| `TELEGRAM_BOT_TOKEN` | (required) | Bot token from @BotFather |
| `ANTHROPIC_API_KEY` | (required) | Anthropic API key |
| `MEMORY_PATH` | `../kit/memory` | Path to Claw Kit memory files |
| `CHAT_MODEL` | `claude-sonnet-4-5-20250929` | Claude model for chat responses |
| `CLASSIFIER_MODEL` | `claude-haiku-4-5-20251001` | Claude model for group chat classifier |
| `MAX_CONTEXT_MESSAGES` | `20` | Max conversation messages to include as context |
| `ALLOWED_USERS` | (empty) | Comma-separated Telegram user IDs |
| `GROUP_CHAT_ENABLED` | `true` | Whether to respond in group chats |
| `PORT` | `3000` | Port for the health check HTTP server |

## Architecture

```
telegram-bridge/
├── src/
│   ├── index.ts              # Entry point, config loading, health server
│   ├── types.ts              # Shared TypeScript interfaces
│   ├── bot/
│   │   ├── setup.ts          # Telegraf bot initialization
│   │   ├── handlers.ts       # Command and message handlers
│   │   ├── groups.ts         # Group chat response classifier
│   │   └── middleware.ts     # Auth and rate limiting middleware
│   └── services/
│       ├── claude.ts         # Claude API client with memory-aware prompts
│       ├── memory.ts         # Memory file read/write/search
│       └── conversation.ts   # Per-chat conversation context management
├── package.json
├── tsconfig.json
└── .env.example
```

## Memory Integration

The bot reads from the same memory files used by the rest of Claw Kit:

- `identity.md` -- Bot personality and identity
- `user.md` -- Information about the user
- `long-term.md` -- Persistent facts and knowledge
- `preferences.md` -- User preferences
- `learnings.md` -- Things learned over time
- `journal/YYYY-MM-DD.md` -- Daily journal entries
- `projects/_index.md` -- Active projects index
- `people/_index.md` -- Known people index

The `/remember` command automatically routes new memories to the appropriate file based on content analysis. Significant chat interactions are also logged to the daily journal.
