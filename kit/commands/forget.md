# /forget

Remove something from memory. This is the "delete" command -- it uses search to find all references to the specified thing and removes them after confirmation.

## Input

Read the user's input from `$ARGUMENTS`. This is the thing they want to forget/remove.

## Instructions

### Step 1: Search Memory

Use the search engine to find all references to the specified thing:
```bash
cd kit/search && npx tsx src/cli.ts search "$ARGUMENTS" --limit 10 --memory-path ../memory
```

The search results will include file paths, line numbers, and relevance scores. This is faster and more thorough than manually reading every file.

If the search results are sparse or might miss things, also do targeted searches with alternate terms:
- If forgetting a person named "John Smith", also search for "John", "Smith"
- If forgetting a project, also search for related tech or keywords

For completeness, also check these files directly for any matches the search might miss:
- `memory/user.md`
- `memory/identity.md`

### Step 2: Present Findings

Show the user everything that was found, organized by file, with relevance scores and line numbers:

```
## Found references to "[thing]":

1. [0.95] memory/people/john-smith.md (lines 1-15)
   > John Smith is the project lead for...

2. [0.82] memory/journal/2026-02-14.md (line 8)
   > Met with John Smith about the API redesign...

3. [0.71] memory/long-term.md (line 23)
   > John's preferred meeting time is Tuesdays at 2pm...

4. [0.65] memory/projects/api-redesign.md (line 5)
   > Lead: John Smith...
```

If nothing was found, say so: "I couldn't find any references to '[thing]' in memory." and suggest checking the spelling or being more specific.

### Step 3: Ask for Confirmation

Ask the user what they want to remove:

- "Remove all of these references?"
- "Remove only specific ones? (list numbers)"
- "Cancel"

Do NOT delete anything without explicit confirmation.

### Step 4: Delete

After confirmation:

- For entries in list files (long-term.md, preferences.md, learnings.md, _index.md files): remove the matching lines/entries while preserving the rest of the file structure.
- For dedicated person/project files: if the user wants to forget a person or project entirely, delete the file AND remove the entry from the corresponding _index.md.
- For decision files: delete the file if confirmed.
- For journal entries: remove only the specific matching lines, not the entire day's entry, unless the user explicitly asks to remove the whole entry.

### Step 5: Reindex

After removing content, reindex to keep the search engine current:
```bash
cd kit/search && npx tsx src/cli.ts index --memory-path ../memory
```

### Step 6: Confirm Deletion

Tell the user exactly what was removed and from which files, with line references. Keep it concise.

```
Removed:
- Entry about [thing] from memory/long-term.md (was line 23)
- File memory/people/john-smith.md (deleted)
- Reference from memory/people/_index.md (line 5)
- Mention in memory/projects/api-redesign.md (line 5, edited)

Search index updated.
```
