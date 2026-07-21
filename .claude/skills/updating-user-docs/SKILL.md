---
name: updating-user-docs
description: Use when a user-visible feature in iobroker-object-explorer was added, changed, or removed, or when asked to update the README, the docs, or the in-app help
---

# Updating User Docs

## Overview

This app documents every user-visible feature in **three** places. They drift independently. A feature is not documented until all three match the current code.

| Surface | File | Audience | Depth |
|---|---|---|---|
| README | `README.md` | operator / developer | full: behavior, settings, file table |
| In-app help | `src/components/modals/HelpModal.tsx` | end user, in the running app | what they see and click, EN **and** DE |
| Feature list | `docs/features.md` | overview reader | one short paragraph |

**"Update the docs" always means all three.** Not README alone.

Refreshing that file's *own* metrics and sweeping it for omissions is a different job — that is the `refreshing-project-docs` skill. Here you only add or correct the entry for the feature you are documenting.

## Source of Truth

Read the **current source file on the checked-out branch**. Never document from a commit message, `git show`, or a diff — they describe one change, not the resulting behavior, and they go stale the moment a follow-up commit lands.

Before writing, confirm the feature actually exists in your checkout:

```bash
git branch --show-current
grep -rn "<ComponentName>" src/   # must hit real code, not just docs
```

If the component is missing, you are on the wrong branch. Stop and say so — do not reconstruct the feature from history.

## HelpModal Mechanics

`HelpModal.tsx` is one file with 17 `AccordionItem` sections and ~71 `SubSection` blocks. Section ids:

`layout` `features` `tree` `table` `batch` `context` `toolbar` `editing` `dualpane` `settings` `optimize` `virtualfolders` `history` `database` `connection` `keys` `search`

Adding help content means **three** edits, all required:

1. A `SubSection` inside the right `AccordionItem`, with **both** an EN and a DE branch (`isEn ? … : …`). One language only is a bug — the app ships both.
2. The matching entry in `SECTION_KEYWORDS` extended with **EN and DE search terms**. The help has a freetext search that filters on this string alone; a section with no keywords is unreachable even though it renders.
3. A lucide-react icon import if you used a new one.

Keyboard shortcuts live in the `SHORTCUTS` array, search syntax in `SEARCH_COMMANDS` — edit those arrays, don't write prose about them.

## Altitude

The help modal is for end users of the app, not for its maintainers.

| Belongs in help | Belongs in README only |
|---|---|
| what the button does | chunk sizes, limits, constants |
| what the user sees happen | SQL guards, whitelists, query strategy |
| when to use it, what it costs them | file paths, component names, hook names |
| irreversible actions — say so plainly | React Query keys, cache behavior |

New source file added? Add its row to the README `## Project Structure` table.

## Fix What You Touch

While editing a section, stale neighbouring text is **in scope**, not out of it. Both docs currently claim "Light / Dark / Obsidian" while `ThemeContext.tsx` defines six themes — that is exactly the drift this skill exists to stop. Correct it and mention it in your report.

Source comments are the exception: a comment that contradicts its own code is a real bug, but fixing it is a code change, not a docs change. Report it, do not silently edit it.

## Verify

```bash
npx tsc --noEmit && npm run lint
```

`HelpModal.tsx` is JSX — an unbalanced tag or a missing `isEn ?` branch is a build break, not a typo. Both commands must run. In a fresh worktree there is no `node_modules`; symlink the main repo's rather than skipping verification.

Lint currently emits ~51 pre-existing `react-refresh` warnings. Zero *errors* is the bar; do not "fix" the warnings as a side quest.

Then confirm coverage of the thing you documented:

```bash
grep -ci "<feature term>" README.md src/components/modals/HelpModal.tsx docs/features.md
```

Three non-zero counts, or you are not done.

## Rationalizations

| Excuse | Reality |
|---|---|
| "They only said README" | In-app help is documentation. Users read it far more often than the README. |
| "The commit diff is unambiguous" | It describes a change, not the current behavior. Read the file. |
| "The feature isn't in my checkout, I'll work from the diff" | Wrong branch. Stop and report it. |
| "Users should know how it works internally" | They cannot read `src/`. Constants and SQL belong in the README. |
| "That stale line is out of scope" | You are editing that section. Fix it. |
| "features.md is just a summary" | It is one of the three surfaces. Update it. |
| "It renders, so it's findable" | Not without `SECTION_KEYWORDS`. The help search reads nothing else. |
| "I'll add DE later" | The app ships DE now. Half a SubSection is a bug. |

## Red Flags — Stop

- You edited `README.md` and nothing under `src/components/modals/HelpModal.tsx`
- You wrote a `SubSection` with only one language
- You added a section id but not its keywords
- You cited a commit sha as your source
- Your help text contains a number that came from a constant
