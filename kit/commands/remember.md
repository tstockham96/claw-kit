# /remember

Store something in the appropriate memory file. This command is the smart router for the memory system.

## Input

Read the user's input from `$ARGUMENTS`. This is the thing they want to remember.

## Instructions

### Step 1: Parse and Classify

Analyze the input and classify it into exactly one of these categories:

| Category | Target File | Trigger Examples |
|----------|------------|-----------------|
| **Fact** | `memory/long-term.md` | General knowledge, reference info, account details, important dates |
| **Preference** | `memory/preferences.md` | Likes, dislikes, style choices, tool preferences, workflow habits |
| **Person** | `memory/people/[name].md` | Info about a specific person -- who they are, relationship, contact details |
| **Project** | `memory/projects/[name].md` | Project status, context, goals, tech stack, deadlines |
| **Decision** | `memory/decisions/YYYY-MM-DD-slug.md` | A significant decision with rationale -- "we decided to...", "I chose..." |
| **Lesson** | `memory/learnings.md` | Mistakes made, corrections received, patterns discovered |

If the classification is ambiguous, present the top two options and ask the user which fits best. Do not guess.

### Step 2: Check for Duplicates

Before storing, search memory to see if this information already exists:
```bash
cd kit/search && npx tsx src/cli.ts search "key terms from the input" --limit 5 --memory-path ../memory
```

If a close match is found, tell the user and ask whether to update the existing entry or add a new one.

### Step 3: Route and Store

Based on the classification:

#### Fact
- Read `memory/long-term.md`
- Append the fact under the appropriate section (`## Facts` or `## Reference`)
- Include today's date in parentheses after the entry: `(YYYY-MM-DD)`

#### Preference
- Read `memory/preferences.md`
- Append under the most fitting section (`## Communication`, `## Technical`, or `## Work Style`)
- If no section fits, create a new `## Other` section
- Include today's date in parentheses

#### Person
- Derive a filename from the person's name: lowercase, hyphens for spaces (e.g., `jane-smith.md`)
- **Sanitize the filename:** strip any characters that are not alphanumeric, hyphens, or underscores. Never allow path separators (/ or \) in the filename.
- Check if `memory/people/[name].md` exists
  - If yes: read it and append/update the relevant section
  - If no: create it with this structure:
    ```
    # [Full Name]

    ## Role / Relationship
    - [What the user said]

    ## Details
    - [Any additional details]

    ## Notes
    <!-- Added YYYY-MM-DD -->
    ```
- Then read `memory/people/_index.md` and add or update the entry: `**Name** -- relationship/role, key context`

#### Project
- Derive a filename from the project name: lowercase, hyphens for spaces (e.g., `my-app.md`)
- **Sanitize the filename:** strip any characters that are not alphanumeric, hyphens, or underscores. Never allow path separators (/ or \) in the filename.
- Check if `memory/projects/[name].md` exists
  - If yes: read it and append/update the relevant section
  - If no: create it with this structure:
    ```
    # [Project Name]

    ## Overview
    - [What the user said]

    ## Status
    - Active (as of YYYY-MM-DD)

    ## Key Details
    - [Any additional details]

    ## Log
    - YYYY-MM-DD: Created
    ```
- Then read `memory/projects/_index.md` and add or update the entry: `**Project Name** -- status, key details`

#### Decision
- Create `memory/decisions/YYYY-MM-DD-slug.md` where slug is a short kebab-case summary (e.g., `2026-02-15-switch-to-postgres.md`)
- Use this structure:
  ```
  # Decision: [Short Title]

  **Date:** YYYY-MM-DD
  **Status:** Decided

  ## Context
  [Why this decision was needed]

  ## Decision
  [What was decided]

  ## Rationale
  [Why this option was chosen]

  ## Consequences
  [Expected outcomes or trade-offs]
  ```

#### Lesson
- Read `memory/learnings.md`
- Append under `## Corrections` (if it's a mistake/correction) or `## Patterns` (if it's a recurring pattern)
- Include today's date in parentheses

### Step 4: Reindex

After storing, update the search index so the new memory is immediately searchable:
```bash
cd kit/search && npx tsx src/cli.ts index --memory-path ../memory
```

### Step 5: Confirm

Tell the user:
- What was stored (brief summary)
- Where it was stored (file path relative to the project root)
- The category it was classified as

Keep confirmation concise. One or two sentences.
