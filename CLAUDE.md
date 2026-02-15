# Claw Kit

Persistent AI identity, memory, and messaging for Claude Code.

## What This Is

Claw Kit gives Claude Code a persistent identity and long-term memory across sessions. It's inspired by OpenClaw but built entirely within Claude Code's ecosystem — no daemons, no unofficial libraries, fully auditable plaintext files.

## Project Structure

```
claw-kit/
├── kit/                    ← the distributable config
│   ├── CLAUDE.md           ← core AI behavior rules (copy to project root)
│   ├── commands/           ← slash commands (/remember, /status, etc.)
│   └── memory/             ← all memory files (identity, journals, etc.)
├── telegram-bridge/        ← standalone Telegram bot service
├── examples/               ← example identity templates
├── setup.sh                ← interactive onboarding
└── README.md               ← public distribution docs
```

## Quick Start

```bash
./setup.sh
```

The setup script walks you through:
1. Choosing an install location
2. Setting up your user profile
3. Configuring the AI's personality
4. Scaffolding all memory files

After setup, open Claude Code and run `/status` to verify everything works.

## Memory System

All memory is stored in `kit/memory/` as plaintext markdown:

| File | Purpose |
|------|---------|
| `identity.md` | AI personality, voice, boundaries |
| `user.md` | About the human |
| `long-term.md` | Curated key facts |
| `preferences.md` | Learned user preferences |
| `learnings.md` | Mistakes + corrections |
| `journal/YYYY-MM-DD.md` | Daily session logs |
| `people/[name].md` | Relationship context |
| `projects/[name].md` | Active project state |
| `decisions/YYYY-MM-DD-slug.md` | Decision log with rationale |

## Commands

| Command | What it does |
|---------|-------------|
| `/status` | Show what the AI knows about you |
| `/remember <thing>` | Save something to the right memory file |
| `/reflect` | Curate recent journals into long-term memory |
| `/briefing` | Morning summary — where you left off |
| `/forget <thing>` | Remove something from memory |

## Telegram Bridge

Optional messaging integration via official Telegram Bot API. See `telegram-bridge/README.md` for setup.

## Development

```bash
# Telegram bridge
cd telegram-bridge
npm install
npm run dev

# Type check
npx tsc --noEmit
```

## Security Model

- No always-on daemon — services run only when you start them
- No unofficial protocol libraries — Telegram uses the official Bot API
- All memory is plaintext markdown — fully auditable
- API keys stay in `.env` files, never in memory
- User allowlisting for Telegram access
