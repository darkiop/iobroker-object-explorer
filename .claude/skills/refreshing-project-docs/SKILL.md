---
name: refreshing-project-docs
description: Use when asked to refresh, update or re-verify docs/stats.md, docs/features.md or docs/superpowers/plan-implementation-status.md, or when project metrics, feature coverage or plan status may have drifted after new commits
---

# Refreshing Project Docs

## Overview

Three docs restate what the code already knows. They go stale silently, and the failure mode is not "missing number" — it is **a plausible-looking number that was guessed at**.

| File | Contains | Refresh means |
|---|---|---|
| `docs/stats.md` | counts, LOC, git history, deps | re-run the commands below, paste real output |
| `docs/features.md` | user-visible feature list | sweep code for features the list is **missing** |
| `docs/superpowers/plan-implementation-status.md` | per-plan done/partial/open + line citations | re-verify every claim against the checkout |

**Core rule: every number in these files must come from a command in this skill.** If you cannot reproduce a number, that is a finding to report — not a licence to round to something nearby.

## Conventions (settled — do not re-litigate)

- **Measure at `HEAD`**, always. Not "the last code commit", not "before the pending docs commit". The docs commit counting itself is expected and fine.
- **Contributors = distinct emails**, not distinct author names. `git shortlog -sne` shows `Thorsten Walk` and `darkiop` under one address — that is one person.
- **Never silently change a metric's definition.** If a stats.md figure no longer matches its command, fix the command block in stats.md and say so in your report.

## stats.md — the commands

Run from repo root. These are the definitions; nothing else counts.

```bash
# --- Codebase ---
git ls-files -z 'src/**/*.ts' 'src/**/*.tsx' 'src/*.ts' 'src/*.tsx' | xargs -0 cat | wc -l          # LOC ts/tsx total
find src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' -exec cat {} + | wc -l               # LOC excl. test
find src \( -name '*.ts' -o -name '*.tsx' \) | wc -l                                                 # files total
find src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' | wc -l                              # files excl. test
find src/components -name '*.tsx' ! -name '*.test.tsx' | wc -l                                       # components
find src/components -type f | wc -l                                                                  # component files total
ls src/context/*.ts src/context/*.tsx | grep -v test | wc -l                                         # context providers
grep -c '^export ' src/hooks/useObjectQueries.ts                                                     # query hook exports
grep -c '^export ' src/api/iobroker.ts                                                               # api exports
grep -c '^export \(async \)\?function' src/api/iobroker.ts                                           # api functions
grep -c '^export \(interface\|type\)' src/types/iobroker.ts                                          # types

# LOC all sources (incl. CSS/HTML/config) — tracked files only, no lockfile, no agent tooling
git ls-files -z | grep -zE '\.(ts|tsx|js|cjs|mjs|css|html|json|yml|yaml|conf|sh|webmanifest)$' \
  | grep -zv 'package-lock.json' | grep -zv '^\.claude/' | grep -zv '^\.agents/' | xargs -0 cat | wc -l

# --- Tests: run them, do not grep ---
npx vitest run --reporter=basic     # take "Test Files N passed" and "Tests N passed"

# --- Largest files ---
find src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' -print0 | xargs -0 wc -l | sort -rn | head -20

# --- Git history (at HEAD) ---
git rev-list --count HEAD
git log --reverse --format=%ad --date=short | head -1
git log -1 --format=%ad --date=short
git shortlog -sne HEAD
for t in feat fix refactor docs perf chore style test ci; do
  printf '%-10s %s\n' "$t" "$(git log --format=%s | grep -cE "^$t(\(.*\))?!?:")"
done

# --- Dependencies ---
node -e "const p=require('./package.json');for(const k of ['dependencies','devDependencies']){const d=Object.keys(p[k]||{});console.log(k,'('+d.length+'):',d.join(', '))}"
```

### Two traps

**`.claude/worktrees/` holds agent worktrees with full copies of `src/`.** `vitest.config.ts` (`include`) and `eslint.config.js` (`ignores`) both guard against this — but if a test count suddenly triples or lint reports errors in files you never touched, check the reported file path first. A path under `.claude/` means a guard was dropped, not that the code broke.

**The "all sources" LOC metric must stay anchored.** `stats.md` should carry that command verbatim in a code block next to the number. If it does not yet, add it as part of the refresh — an unanchored metric is how this doc drifted the first time. Change the command in one place, change it in both.

## features.md — sweep for what is *missing*

Verifying that every documented feature exists is the easy half and proves almost nothing. The doc goes stale by **omission**. Do the inverse sweep:

```bash
# settings keys that exist in code
grep -oE '^\s{2}[a-zA-Z][a-zA-Z0-9]*[?]?:' src/context/UIContext.tsx | tr -d ' ?:' | sort -u
# modals + ui components that exist
ls src/components/modals src/components/ui
# then: which of these has no mention in docs/features.md?
```

For each hit with no mention, decide: user-visible → must be documented; internal → skip.

**features.md is one of three doc surfaces.** If it is missing a feature, README and `HelpModal.tsx` almost certainly are too. **REQUIRED SUB-SKILL:** use `updating-user-docs` to add it — do not patch features.md alone.

## plan-implementation-status.md — re-verify, don't spot-check

Every row makes a falsifiable claim. Check all of them.

1. **File-existence claims** — loop over every path the doc calls missing/present, confirm each.
2. **Line citations** — the doc cites `file.ts:1633` style. Line numbers drift with any edit above them. Re-grep the *symbol* and correct the number.
3. **Measures table M-01…M-10** — each has its own probe (e.g. `grep -cE '^(let|const) _' src/api/iobroker.ts` for M-06 singletons).
4. **Header line** — update the "As of DATE — branch X" line: `date +%F` and `git branch --show-current`.
5. **Plans moved to `done/`** — `ls docs/superpowers/specs docs/superpowers/done` and reconcile against the tables.

A plan whose files all now exist is not automatically ✅ — read the plan's acceptance criteria before promoting it.

## Report

State per file: changed / unchanged, and which numbers moved. List any command that failed to reproduce a documented figure. Do not claim a file is current unless you ran its commands this session.

## Rationalizations

| Excuse | Reality |
|---|---|
| "The doc is the HEAD commit, so it can't be stale" | Uncommitted work, branch switches and follow-up commits all break this. Run the commands. |
| "The number is close enough / it has a `~`" | `~` is a rounding tolerance, not a licence to guess. Run the command. |
| "I can't reproduce that figure, I'll compute my own" | That silently redefines the metric. Report the mismatch and anchor the command instead. |
| "Everything the doc claims exists — features.md is fine" | That is the forward check only. Omissions are the actual failure mode. Sweep the inverse. |
| "Line numbers are approximate" | They are clickable citations. A wrong one is worse than none. Re-grep the symbol. |
| "shortlog shows 2 names, so 2 contributors" | Same email = one human. |
| "Test count tripled — lots of new tests" | You counted `.claude/worktrees/`. Check the reported file paths. |
| "features.md is just a summary, I'll update it alone" | It is one of three surfaces. Use `updating-user-docs`. |
| "The plan's files exist now, mark it done" | Existence ≠ acceptance criteria met. Read the plan. |

## Red Flags — Stop

- You wrote a number you did not see in command output this session
- You changed a metric's meaning without changing its anchored command
- You edited `features.md` and nothing else
- You marked a plan ✅ without reading its acceptance criteria
- Your report says "verified" but you only spot-checked a few rows
