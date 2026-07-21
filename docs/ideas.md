# UI Improvement Ideas

Brainstorming notes, 2026-07-21. Grounded in a read of the current toolbar, modal layer, search bar, and keyboard handling — not generic UI advice.

## Observations

- **Toolbar is flat and crowded.** `StateListToolbar.tsx` renders 12 always-visible buttons with no grouping and no overflow handling. In icon-only mode (`showToolbarLabels: false`) discoverability drops to zero — the only affordance is a `title` tooltip.
- **Icon collision.** `RotateCcw` is used twice with different meanings: script index refresh (harmless, repeatable) and settings reset / clear localStorage (destructive). The destructive one also sits directly next to "Fit columns to container", which is harmless.
- **No shared modal shell.** 23 modal components each hand-roll their own `fixed inset-0` overlay markup. A `useEscapeKey` hook does exist and 19 dialogs use it, so Esc is largely handled — but backdrop opacity and blur, entry animations, and z-index are inconsistent (`bg-black/60` vs `bg-black/50`; `z-50` vs `z-[60]` vs `z-[9998]`; `VirtualFoldersModal` has no backdrop click-to-close at all). No dialog anywhere sets `role="dialog"`, `aria-modal`, or traps focus.
- **No global command entry point.** Three global shortcuts exist in `Layout.tsx`: Ctrl+B (sidebar), Ctrl+. (settings), Ctrl+F (search). Row-level navigation (↑/↓, Enter, Tab to switch panels) already exists per `HelpModal`'s `SHORTCUTS` list. What is missing is a single searchable entry point to the 23 dialogs and the toolbar actions.
- **Search syntax is powerful but hidden.** `SearchBar.tsx` supports `room:`, `function:`, `type:`, `role:`, `id:`, `name:`, `desc:` tokens with autocomplete. Nothing in the UI advertises this — a user has to type into the box to discover it.
- **Toasts exist but are barely wired.** `ToastContext` / `ToastContainer` are mounted in `App.tsx`, but `OptimizeModal` is the only consumer. Rename, move, delete, and batch edit complete silently.

## Ideas

### A. Command palette (Ctrl+K)

Single entry point to all 23 modals, all toolbar actions, and jump-to-ID navigation. Lets the toolbar shrink to only frequent actions. Can reuse the existing suggestion-building machinery from `SearchBar.tsx`.

Highest leverage of the list: fixes discoverability and toolbar crowding in one move.

### B. Toolbar restructure

Cluster buttons into Create / Data / Analyze / View groups, add an overflow menu at narrow widths, deduplicate the `RotateCcw` icon, and move the destructive settings reset into the Settings modal where it belongs.

Cheap, introduces no new concepts.

### C. Shared modal shell

Extract one `<Modal>` primitive handling portal, backdrop, animation, z-layering, focus trap, and `role="dialog"`. All 23 modal files shrink and their behavior becomes consistent. A modal stack makes Esc reach only the topmost dialog, fixing the nested-confirm collisions that four dialogs currently work around with inline ternaries.

Mostly a refactor, but it closes a real accessibility gap — no dialog traps focus today.

### D. Keyboard navigation gaps

Largely already done: ↑/↓ row navigation, Enter to open, and Tab to switch panels all exist. Remaining gaps are small — Space to toggle a row checkbox, `/` to focus search. Low value on its own; fold into another change rather than planning separately.

### E. Detail drawer instead of modal

Row click opens a right-side panel rather than a modal, so the table stays visible and values can be compared while editing. Larger change, and it overlaps with the existing dual-pane mode — needs its own design pass.

### F. Toast coverage

Wire the existing toast system into all mutations (rename, move, delete, batch edit). Small change, large gain in perceived quality.

## Recommendation

Treat **A + C** as one project: C is the groundwork, A is the visible win, and B follows as a consequence of A. F is a good low-risk companion. E deserves a separate design later.

Planned in:
- `superpowers/specs/2026-07-21-modal-shell.md` — idea C
- `superpowers/specs/2026-07-21-command-palette.md` — ideas A and B (depends on the shell)
