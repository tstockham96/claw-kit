# /briefing

Morning summary. Show the user where things stand so they can pick up where they left off. This is the "catch me up" command.

## Instructions

### Step 1: Gather Context

Read the following files directly (skip any that don't exist):

1. `memory/journal/YYYY-MM-DD.md` -- today's date (may not exist if it's early in the day)
2. `memory/journal/YYYY-MM-DD.md` -- yesterday's date
3. `memory/journal/YYYY-MM-DD.md` -- two days ago (for additional context if yesterday is thin)
4. `memory/projects/_index.md` -- active projects
5. `memory/people/_index.md` -- known people for context
6. `memory/user.md` -- for timezone and personal context

### Step 2: Search for Recent Activity

Use the search engine to find recent activity, decisions, and context that the direct file reads might miss:

```bash
cd kit/search && npx tsx src/cli.ts search "recent session work progress" --limit 10 --memory-path ../memory
```

Also search for any active project names found in `projects/_index.md` to surface recent project-specific context:
```bash
cd kit/search && npx tsx src/cli.ts search "[project name]" --limit 5 --memory-path ../memory
```

Scan the decisions directory for any files from the last 7 days:
- `memory/decisions/` -- look for files with recent dates in their filenames

### Step 3: Search for People in Context

If any people were mentioned in recent journal entries or search results, search for additional context:
```bash
cd kit/search && npx tsx src/cli.ts search "[person name]" --limit 3 --memory-path ../memory
```

### Step 4: Build the Briefing

Present a clean, scannable summary using this format:

```
## Good morning. Here's where we left off.

### Last Session
[Summarize the most recent journal entry. What was worked on? What was the state when the session ended? Any open threads?]
[Include citations: (Source: journal/YYYY-MM-DD.md#line)]

[If no recent journal entries exist: "No recent session history. This might be our first conversation, or sessions haven't been logged yet."]

### Active Projects
[For each project in _index.md, show: name, current status, and any recent activity from journal entries or search results. Highlight anything that seems urgent or time-sensitive.]
[Include citations to project files and journal entries.]

[If no projects: "No projects being tracked yet."]

### Recent Decisions
[List any decisions from the last 7 days with a one-line summary of each. Include citation to decision file.]

[If none: skip this section entirely.]

### Open Threads
[Extract any unresolved questions, pending items, or "next steps" mentioned in recent journal entries or search results. These are things that might need attention today.]

[If none: skip this section entirely.]

### People in Context
[If any people were mentioned in recent journal entries, note them briefly with their role/relationship. Include citations.]

[If none: skip this section entirely.]
```

### Formatting Rules

- Adapt the greeting based on the user's timezone if known from user.md (morning/afternoon/evening).
- Keep the entire briefing under 30 lines. This should be scannable in 30 seconds.
- Use bullet points, not paragraphs.
- Bold key items that need attention.
- Include `(Source: file#line)` citations for key claims so the user can drill in.
- Skip empty sections entirely rather than showing "None" -- keep it clean.
- If almost nothing exists yet (new setup), keep it brief: acknowledge it's a fresh start and suggest the user start working and the memory will build naturally.
