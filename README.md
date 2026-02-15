# Claw Kit

Persistent AI identity, memory, and messaging for [Claude Code](https://docs.anthropic.com/en/docs/claude-code).

Give your Claude Code a name, personality, and long-term memory that persists across sessions. Optionally chat with it over Telegram.

## Why

[OpenClaw](https://github.com/openclaw) proved the concept: an AI agent with persistent identity, long-term memory, and messaging integration. But its implementation has real security concerns — VirusTotal flags on skill files, an unofficial WhatsApp library ([Baileys](https://github.com/WhiskeySockets/Baileys)) that hijacks your personal session, an opaque SQLite memory store you can't easily inspect, and an always-on gateway daemon running in the background.

**Claw Kit is the safe version.** Same powerful features, none of the risk:

- **No daemon** — nothing runs unless you start it
- **No unofficial libraries** — Telegram bridge uses the official Bot API, not session hijacking
- **No opaque databases** — all memory is plaintext markdown you can read in any text editor
- **No VirusTotal flags** — every file is auditable, every line is readable
- **Your data stays yours** — memory files live on your machine, version-controllable with git

If you liked what OpenClaw was going for but didn't trust running it, this is for you.

## Features

- **Persistent Identity** — Name, personality, voice, and boundaries that carry across sessions
- **Long-Term Memory** — Facts, preferences, learnings, and corrections that accumulate over time
- **Daily Journals** — Automatic session logs so the AI remembers what you worked on
- **People & Projects** — Track relationships and project state
- **Decision Log** — Record decisions with rationale for future reference
- **Slash Commands** — `/remember`, `/status`, `/reflect`, `/briefing`, `/forget`
- **Telegram Bridge** — Optional: chat with your AI over Telegram using the official Bot API
- **Fully Auditable** — Everything is plaintext markdown. No databases, no binaries, no surprises.

## Quick Start

```bash
git clone <this-repo> ~/Desktop/claw-kit
cd ~/Desktop/claw-kit
./setup.sh
```

The setup script asks for your name, timezone, role, and AI personality preferences, then scaffolds everything. Takes about 2 minutes.

After setup:

```bash
claude                  # Start Claude Code
> /status              # See what the AI knows
> /remember I prefer TypeScript over JavaScript
> /briefing            # Morning summary
```

## Commands

| Command | Description |
|---------|-------------|
| `/status` | Show what the AI currently knows about you and your work |
| `/remember <thing>` | Smart router — classifies and saves to the right memory file |
| `/reflect` | Curate last 7 days of journals into long-term memory |
| `/briefing` | Morning summary: yesterday's work, active projects, pending decisions |
| `/forget <thing>` | Search memory for something and remove it |

## Memory Files

All stored in `kit/memory/` as markdown:

```
memory/
├── identity.md          ← AI personality & voice
├── user.md              ← About you
├── long-term.md         ← Curated key facts
├── preferences.md       ← Learned preferences
├── learnings.md         ← Mistakes & corrections
├── journal/             ← Daily session logs
│   └── 2026-02-15.md
├── people/              ← Relationship context
│   ├── _index.md
│   └── alice.md
├── projects/            ← Project state
│   ├── _index.md
│   └── my-app.md
└── decisions/           ← Decision log
    └── 2026-02-15-chose-postgres.md
```

Every file is human-readable and editable. You can version control your memory with git.

## Telegram Bridge (Optional)

Chat with your AI assistant over Telegram using the official Bot API.

### Setup

1. Message [@BotFather](https://t.me/botfather) on Telegram to create a bot
2. Get an API key from [console.anthropic.com](https://console.anthropic.com)
3. Configure:

```bash
cd telegram-bridge
cp .env.example .env
# Edit .env with your tokens
npm install
npm run dev
```

### Features

- 1:1 chat with full memory context
- Group chat with smart response filtering (only speaks when it adds value)
- User allowlisting for security
- Conversation context across messages
- Telegram-native commands: `/start`, `/status`, `/remember`, `/forget`, `/help`

See [`telegram-bridge/README.md`](telegram-bridge/README.md) for full documentation.

## Security: Claw Kit vs OpenClaw

The whole point of Claw Kit is that you can trust what's running on your machine.

| | Claw Kit | OpenClaw |
|---|---|---|
| **Runtime** | Nothing runs unless you start it | Always-on gateway daemon |
| **Messaging** | Official Telegram Bot API | Unofficial WhatsApp library (Baileys) that hijacks your personal WhatsApp session |
| **Memory storage** | Plaintext markdown — open in any text editor | Opaque SQLite database |
| **Authentication** | Telegram bot token (separate identity) + user allowlisting | Your personal WhatsApp session token — if compromised, attacker has your WhatsApp |
| **Code trust** | Every file is readable, no compiled/obfuscated code | VirusTotal flags on skill files |
| **Data portability** | Copy your `memory/` folder anywhere, version control with git | Locked in SQLite, requires migration tooling |
| **Attack surface** | Claude Code + optional Telegram bot | Always-on daemon + WhatsApp Web socket + SQLite + skill system |

## Identity Templates

Check out `examples/` for pre-built personality configurations:

- **Developer** — Direct, opinionated about code, celebrates clean solutions
- **Researcher** — Thorough, citation-conscious, connects ideas across domains
- **Executive Assistant** — Organized, anticipates needs, manages context

Copy any template to `kit/memory/identity.md` and customize.

## How It Works

1. `kit/CLAUDE.md` tells Claude Code to read memory files on session start
2. Claude loads your identity, preferences, recent journals, and project state
3. As you work, Claude updates memory files (journals, learnings, preferences)
4. Slash commands let you explicitly manage memory (`/remember`, `/forget`, `/reflect`)
5. The Telegram bridge reads the same memory files, so your AI knows you across interfaces

## Requirements

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) CLI
- Node.js 18+ (for Telegram bridge only)
- Telegram account (for Telegram bridge only)
- Anthropic API key (for Telegram bridge only — Claude Code uses its own auth)

## License

MIT
