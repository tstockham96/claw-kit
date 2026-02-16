# /status

Show a comprehensive summary of everything the AI currently knows, plus the health of the search index. This is the "what do you know about me?" command.

## Instructions

### Step 1: Check Search Index Health

Run the search index status to get stats on indexed memory:
```bash
cd kit/search && npx tsx src/cli.ts status --memory-path ../memory
```

Note the number of chunks, files indexed, and when the index was last updated.

### Step 2: Read Core Memory Files

Read the following files. If a file doesn't exist or is empty/unconfigured, note that section as "Not set up yet."

1. `memory/identity.md`
2. `memory/user.md`
3. `memory/long-term.md`
4. `memory/preferences.md`
5. `memory/learnings.md`
6. `memory/people/_index.md`
7. `memory/projects/_index.md`
8. `memory/journal/YYYY-MM-DD.md` (today's date)

### Step 3: Present Summary

Format the output as a clean, well-structured summary using this template:

```
## Status: Here's What I Know

### Search Index
- **Files indexed:** [N]
- **Chunks:** [N]
- **Last indexed:** [timestamp or "Never"]
- **Health:** [Good / Stale / Empty]

### My Identity
[Summarize identity.md -- name, personality, role. Or "Not configured yet."]

### About You
[Summarize user.md -- name, timezone, what they do, any context. Or "Not set up yet."]

### Key Facts
[List facts from long-term.md, or "No facts stored yet."]

### Your Preferences
[Summarize preferences.md -- communication, technical, work style. Or "No preferences recorded yet."]

### Lessons Learned
[Summarize learnings.md -- corrections and patterns. Or "No learnings recorded yet."]

### Active Projects
[List from projects/_index.md, or "No projects tracked yet."]

### Known People
[List from people/_index.md, or "No people recorded yet."]

### Recent Activity
[Summarize today's journal entry if it exists, or "No activity logged today."]
```

### Formatting Rules

- Keep each section to 2-4 lines maximum. This is a summary, not a dump.
- If a section has many entries, show the 5 most recent and note how many more exist.
- Use bullet points for lists.
- The Search Index section should always appear first after the heading -- it tells the user whether memory retrieval is working.
- If the index is stale or empty, suggest running the indexer: `cd kit/search && npx tsx src/cli.ts index --memory-path ../memory`
- If most sections are empty, suggest that the user start populating memory with `/remember` or by running the setup process.
