# /forget

Remove something from memory. This is the "delete" command — it searches all memory files for the specified thing and removes it after confirmation.

## Input

Read the user's input from `$ARGUMENTS`. This is the thing they want to forget/remove.

## Instructions

### Step 1: Search All Memory Files

Search for the specified thing across ALL memory files:

1. `memory/long-term.md`
2. `memory/preferences.md`
3. `memory/learnings.md`
4. `memory/people/_index.md` and all files in `memory/people/`
5. `memory/projects/_index.md` and all files in `memory/projects/`
6. `memory/decisions/` — all files
7. `memory/journal/` — all files
8. `memory/user.md`
9. `memory/identity.md`

Search broadly. Match on:
- Exact text matches
- Semantic matches (e.g., if the user says "forget about John", match entries about "John Smith")
- Related entries (e.g., if forgetting a person, also find their mentions in journal entries and project files)

### Step 2: Present Findings

Show the user everything that was found, organized by file:

```
## Found references to "[thing]":

### memory/long-term.md
- [matching line or entry]

### memory/people/john-smith.md
- [matching content summary]

### memory/journal/2026-02-14.md
- [matching line]
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

### Step 5: Confirm Deletion

Tell the user exactly what was removed and from which files. Keep it concise.

```
Removed:
- Entry about [thing] from memory/long-term.md
- File memory/people/john-smith.md (deleted)
- Reference from memory/people/_index.md
```
