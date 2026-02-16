# /reflect

Curate and compress recent memory. This command reviews the last 7 days of journal entries, extracts durable insights, and updates long-term memory files. Think of it as memory maintenance -- moving important things from short-term to long-term storage.

## Instructions

### Step 1: Gather Recent History

Search for recent journal entries and activity using the search engine:
```bash
cd kit/search && npx tsx src/cli.ts search "journal session summary" --limit 20 --memory-path ../memory
```

Also read journal entries for the last 7 days directly. For each day from today back to 7 days ago, check if `memory/journal/YYYY-MM-DD.md` exists and read it if so. The search results may surface entries the direct reads miss, and vice versa.

Also read the current state of:
- `memory/long-term.md`
- `memory/preferences.md`
- `memory/learnings.md`
- `memory/projects/_index.md`

### Step 2: Extract Insights

From the journal entries and search results, identify:

1. **Key facts** that should be remembered long-term (decisions made, things learned, important context established). These go into `memory/long-term.md`.

2. **Preference patterns** -- things the user consistently does, prefers, or reacts to. If you notice something appearing more than once, or a clear preference emerging from behavior, it belongs in `memory/preferences.md`. Only add genuine patterns, not one-off observations.

3. **Lessons learned** -- mistakes that were made, corrections that were applied, or insights about what works and what doesn't. These go into `memory/learnings.md`.

4. **Project status updates** -- if projects had meaningful progress, update `memory/projects/_index.md` with current status.

### Step 3: Check for Duplicates via Search

Before adding each insight, search to see if it's already captured:
```bash
cd kit/search && npx tsx src/cli.ts search "key terms from the insight" --limit 3 --memory-path ../memory
```

Only add genuinely new information. If an existing entry needs updating, modify it rather than creating a duplicate.

### Step 4: Update Memory Files

For each insight extracted:

- Read the target memory file
- Check if the insight is already captured (avoid duplicates)
- If it's genuinely new, append it under the appropriate section with today's date
- If it updates an existing entry, modify that entry rather than creating a duplicate

Be selective. Not everything in a journal entry deserves long-term storage. Focus on:
- Things that would be useful to know in a future session
- Patterns that help you serve the user better
- Decisions and their rationale
- Facts that provide important context

Skip:
- Routine work details ("fixed a typo", "ran tests")
- Temporary context that won't matter next week
- Things already captured in long-term memory

### Step 5: Reindex

After all updates are complete, reindex so the new long-term memories are searchable:
```bash
cd kit/search && npx tsx src/cli.ts index --memory-path ../memory
```

### Step 6: Report Changes

Present a summary of what was done, with citations to specific files:

```
## Reflection Complete

### Journal Entries Reviewed
- [List dates that had entries, or "No journal entries found for the last 7 days."]

### Added to Long-Term Memory
- [List each new fact added with citation, e.g., "Added X (Source: long-term.md#line)", or "Nothing new."]

### Updated Preferences
- [List preference updates with citations, or "No new patterns detected."]

### Lessons Recorded
- [List lessons added with citations, or "No new lessons."]

### Project Updates
- [List any project status changes, or "No changes."]

### Search Index
- Reindexed: [N] files, [N] chunks
```

If no journal entries exist for the past 7 days, say so and suggest the user start logging sessions (this happens automatically at the end of significant sessions, per the CLAUDE.md rules).
