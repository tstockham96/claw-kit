# Contributing to Claw Kit

Thanks for your interest in contributing! Here's how to do it.

## Process

1. **Fork the repo** and create a branch from `main`
2. **Make your changes** — keep them focused on a single issue or feature
3. **Test your changes** — run `npx tsc --noEmit` in any TypeScript package you touched
4. **Open a pull request** against `main`

All PRs require approval from a maintainer before merging. This keeps the project stable and secure.

## What to contribute

- Bug fixes
- Security improvements
- New identity templates (in `examples/`)
- Documentation improvements
- Search engine enhancements
- Telegram bridge features

## Guidelines

- **Keep it simple.** Claw Kit's value is in its simplicity. Don't add complexity unless it's clearly worth it.
- **Markdown is the source of truth.** Any feature that moves data out of readable markdown files needs a very strong justification.
- **Security matters.** This project's entire pitch is being the safe alternative. Don't introduce dependencies unless necessary, and never add anything that phones home or runs in the background.
- **No opaque databases.** SQLite is used as a rebuildable search cache, not as a primary data store. That's intentional.
- **Type-check before submitting.** Run `npx tsc --noEmit` in `kit/search/` and `telegram-bridge/` if you touched TypeScript.

## Project structure

```
kit/                    ← memory system + slash commands
kit/search/             ← SQLite + FTS5 search engine (TypeScript)
telegram-bridge/        ← Telegram bot (TypeScript)
site/                   ← landing page (static HTML)
setup.sh                ← interactive onboarding
examples/               ← identity templates
```

## Setting up for development

```bash
git clone https://github.com/tstockham96/claw-kit.git
cd claw-kit

# Search engine
cd kit/search && npm install && npx tsc --noEmit

# Telegram bridge
cd ../../telegram-bridge && npm install && npx tsc --noEmit
```

## Questions?

Open an issue or start a discussion. Don't overthink it.
