# Catppuccin Themes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the existing `obsidian` and `catppuccin` themes with properly named Catppuccin flavors: Frappé, Macchiato, and Mocha.

**Architecture:** CSS class overrides on `<html>` — each flavor gets its own CSS class (`.catppuccin-frappe`, `.catppuccin-macchiato`, `.catppuccin-mocha`) that override Tailwind `dark:` prefixed utility classes via `!important`. The `ThemeContext` drives class application and localStorage persistence. On load, stale keys (`obsidian`, `catppuccin`) are migrated forward.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (class-based dark mode), localStorage

---

### Task 1: Update ThemeContext — type, applyTheme, cycle, migration

**Files:**
- Modify: `src/context/ThemeContext.tsx`

- [ ] **Step 1: Replace file contents**

Replace the entire file with:

```typescript
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';

export type Theme = 'light' | 'dark' | 'abyss' | 'catppuccin-frappe' | 'catppuccin-macchiato' | 'catppuccin-mocha';

interface ThemeContextValue {
  theme: Theme;
  dark: boolean;
  cycle: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'dark', dark: true, cycle: () => {}, setTheme: () => {} });

function applyTheme(theme: Theme) {
  const cl = document.documentElement.classList;
  cl.remove('dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha');
  if (theme === 'dark') cl.add('dark');
  if (theme === 'abyss') { cl.add('dark'); cl.add('abyss'); }
  if (theme === 'catppuccin-frappe') { cl.add('dark'); cl.add('catppuccin-frappe'); }
  if (theme === 'catppuccin-macchiato') { cl.add('dark'); cl.add('catppuccin-macchiato'); }
  if (theme === 'catppuccin-mocha') { cl.add('dark'); cl.add('catppuccin-mocha'); }
}

function migrateTheme(raw: string | null): Theme {
  if (raw === 'obsidian') return 'catppuccin-mocha';
  if (raw === 'catppuccin') return 'catppuccin-frappe';
  const valid: Theme[] = ['light', 'dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha'];
  if (valid.includes(raw as Theme)) return raw as Theme;
  return 'catppuccin-mocha';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const raw = localStorage.getItem('theme');
    return migrateTheme(raw);
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const cycle = useCallback(() => {
    setTheme((t) => {
      const order: Theme[] = ['light', 'dark', 'abyss', 'catppuccin-frappe', 'catppuccin-macchiato', 'catppuccin-mocha'];
      return order[(order.indexOf(t) + 1) % order.length];
    });
  }, []);

  const value = useMemo(() => ({ theme, dark: theme !== 'light', cycle, setTheme }), [theme, cycle, setTheme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors (or only pre-existing unrelated errors).

- [ ] **Step 3: Commit**

```bash
git add src/context/ThemeContext.tsx
git commit -m "refactor(theme): rename obsidian/catppuccin to catppuccin-mocha/frappe, add macchiato"
```

---

### Task 2: Update index.css — rename blocks, add Macchiato

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Rename `.obsidian` block to `.catppuccin-mocha`**

In `src/index.css`, replace every occurrence of `.obsidian` with `.catppuccin-mocha` (the block comment header + all selectors).

Change the block comment header from:
```css
/* ============================================================
   Obsidian Theme — Catppuccin Mocha palette
   Applied via .obsidian class on <html> alongside .dark
   ============================================================ */
```
to:
```css
/* ============================================================
   Catppuccin Mocha
   Applied via .catppuccin-mocha class on <html> alongside .dark
   ============================================================ */
```

Then replace all `.obsidian` selectors to `.catppuccin-mocha` (sed or manual — there are ~60 occurrences).

- [ ] **Step 2: Rename `.catppuccin` block to `.catppuccin-frappe`**

Change the block comment header from:
```css
/* ============================================================
   Catppuccin Theme — Frappé palette
   Applied via .catppuccin class on <html> alongside .dark
   ============================================================ */
```
to:
```css
/* ============================================================
   Catppuccin Frappé
   Applied via .catppuccin-frappe class on <html> alongside .dark
   ============================================================ */
```

Replace all `.catppuccin` selectors with `.catppuccin-frappe` (there are ~60 occurrences).

**Important:** The selector `.catppuccin-frappe` must not accidentally match `.catppuccin-macchiato` or `.catppuccin-mocha` — since these are class selectors (`.catppuccin-frappe .dark\:...`), they are exact and will not conflict.

- [ ] **Step 3: Insert the Catppuccin Macchiato block**

After the Frappé block (before the `/* Group expand/collapse animation */` comment), insert:

```css
/* ============================================================
   Catppuccin Macchiato
   Applied via .catppuccin-macchiato class on <html> alongside .dark
   ============================================================ */

/* Scrollbar */
.catppuccin-macchiato ::-webkit-scrollbar-thumb { background: #5b6078; }
.catppuccin-macchiato ::-webkit-scrollbar-thumb:hover { background: #6e738d; }
.catppuccin-macchiato * { scrollbar-color: #5b6078 transparent; }

/* --- Backgrounds (gray) --- */
.catppuccin-macchiato .dark\:bg-gray-900  { background-color: #24273a !important; }
.catppuccin-macchiato .dark\:bg-gray-800  { background-color: #1e2030 !important; }
.catppuccin-macchiato .dark\:bg-gray-700  { background-color: #363a4f !important; }
.catppuccin-macchiato .dark\:bg-gray-600  { background-color: #494d64 !important; }
.catppuccin-macchiato .dark\:bg-gray-500  { background-color: #5b6078 !important; }
.catppuccin-macchiato .dark\:bg-gray-300  { background-color: #939ab7 !important; }

.catppuccin-macchiato .dark\:bg-gray-800\/20 { background-color: rgb(30 32 48 / 0.2) !important; }
.catppuccin-macchiato .dark\:bg-gray-800\/30 { background-color: rgb(30 32 48 / 0.3) !important; }
.catppuccin-macchiato .dark\:bg-gray-800\/40 { background-color: rgb(30 32 48 / 0.4) !important; }
.catppuccin-macchiato .dark\:bg-gray-800\/50 { background-color: rgb(30 32 48 / 0.5) !important; }
.catppuccin-macchiato .dark\:bg-gray-800\/60 { background-color: rgb(30 32 48 / 0.6) !important; }
.catppuccin-macchiato .dark\:bg-gray-800\/70 { background-color: rgb(30 32 48 / 0.7) !important; }
.catppuccin-macchiato .dark\:bg-gray-700\/50 { background-color: rgb(54 58 79 / 0.5) !important; }
.catppuccin-macchiato .dark\:bg-gray-700\/60 { background-color: rgb(54 58 79 / 0.6) !important; }
.catppuccin-macchiato .dark\:bg-gray-700\/70 { background-color: rgb(54 58 79 / 0.7) !important; }
.catppuccin-macchiato .dark\:bg-gray-500\/40 { background-color: rgb(91 96 120 / 0.4) !important; }

/* --- Hover backgrounds --- */
.catppuccin-macchiato .dark\:hover\:bg-gray-600:hover  { background-color: #494d64 !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-700:hover  { background-color: #363a4f !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-800:hover  { background-color: #1e2030 !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-600\/60:hover  { background-color: rgb(73 77 100 / 0.6) !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-700\/50:hover  { background-color: rgb(54 58 79 / 0.5) !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-700\/60:hover  { background-color: rgb(54 58 79 / 0.6) !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-700\/80:hover  { background-color: rgb(54 58 79 / 0.8) !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-800\/40:hover  { background-color: rgb(30 32 48 / 0.4) !important; }
.catppuccin-macchiato .dark\:hover\:bg-gray-800\/50:hover  { background-color: rgb(30 32 48 / 0.5) !important; }

/* --- Text --- */
.catppuccin-macchiato .dark\:text-gray-100 { color: #cad3f5 !important; }
.catppuccin-macchiato .dark\:text-gray-200 { color: #b8c0e0 !important; }
.catppuccin-macchiato .dark\:text-gray-300 { color: #a5adcb !important; }
.catppuccin-macchiato .dark\:text-gray-400 { color: #8087a2 !important; }
.catppuccin-macchiato .dark\:text-gray-500 { color: #6e738d !important; }
.catppuccin-macchiato .dark\:text-gray-600 { color: #5b6078 !important; }
.catppuccin-macchiato .dark\:text-gray-700 { color: #494d64 !important; }

/* --- Hover text --- */
.catppuccin-macchiato .dark\:hover\:text-gray-200:hover { color: #b8c0e0 !important; }
.catppuccin-macchiato .dark\:hover\:text-gray-300:hover { color: #a5adcb !important; }
.catppuccin-macchiato .dark\:hover\:text-gray-400:hover { color: #8087a2 !important; }

/* --- Borders --- */
.catppuccin-macchiato .dark\:border-gray-900 { border-color: #24273a !important; }
.catppuccin-macchiato .dark\:border-gray-800 { border-color: #1e2030 !important; }
.catppuccin-macchiato .dark\:border-gray-700 { border-color: #363a4f !important; }
.catppuccin-macchiato .dark\:border-gray-600 { border-color: #494d64 !important; }
.catppuccin-macchiato .dark\:border-gray-500 { border-color: #5b6078 !important; }

.catppuccin-macchiato .dark\:border-gray-800\/60 { border-color: rgb(30 32 48 / 0.6) !important; }
.catppuccin-macchiato .dark\:border-gray-700\/60 { border-color: rgb(54 58 79 / 0.6) !important; }
.catppuccin-macchiato .dark\:border-gray-600\/50 { border-color: rgb(73 77 100 / 0.5) !important; }
.catppuccin-macchiato .dark\:border-gray-600\/60 { border-color: rgb(73 77 100 / 0.6) !important; }
.catppuccin-macchiato .dark\:border-gray-600\/70 { border-color: rgb(73 77 100 / 0.7) !important; }

/* --- Hover border --- */
.catppuccin-macchiato .dark\:hover\:border-gray-600:hover { border-color: #494d64 !important; }

/* --- Placeholder --- */
.catppuccin-macchiato .dark\:placeholder-gray-400::placeholder { color: #8087a2 !important; }
.catppuccin-macchiato .dark\:placeholder-gray-500::placeholder { color: #6e738d !important; }
.catppuccin-macchiato .dark\:placeholder-gray-600::placeholder { color: #5b6078 !important; }

/* --- Divide --- */
.catppuccin-macchiato .dark\:divide-gray-700 > * + * { border-color: #363a4f !important; }
.catppuccin-macchiato .dark\:divide-gray-800 > * + * { border-color: #1e2030 !important; }

/* -------------------------------------------------------
   Blue → Macchiato Blue/Lavender accent overrides
   ------------------------------------------------------- */
.catppuccin-macchiato .dark\:text-blue-100 { color: #e5e9ff !important; }
.catppuccin-macchiato .dark\:text-blue-200 { color: #c6ceff !important; }
.catppuccin-macchiato .dark\:text-blue-300 { color: #b7bdf8 !important; }
.catppuccin-macchiato .dark\:text-blue-400 { color: #b7bdf8 !important; }
.catppuccin-macchiato .dark\:text-blue-500 { color: #8aadf4 !important; }

.catppuccin-macchiato .dark\:hover\:text-blue-200:hover { color: #c6ceff !important; }
.catppuccin-macchiato .dark\:hover\:text-blue-300:hover { color: #b7bdf8 !important; }
.catppuccin-macchiato .dark\:hover\:text-blue-400:hover { color: #b7bdf8 !important; }

.catppuccin-macchiato .dark\:bg-blue-400\/25  { background-color: rgb(183 189 248 / 0.25) !important; }
.catppuccin-macchiato .dark\:bg-blue-500      { background-color: #8aadf4 !important; }
.catppuccin-macchiato .dark\:bg-blue-500\/10  { background-color: rgb(183 189 248 / 0.1) !important; }
.catppuccin-macchiato .dark\:bg-blue-500\/20  { background-color: rgb(183 189 248 / 0.2) !important; }
.catppuccin-macchiato .dark\:bg-blue-900\/20  { background-color: rgb(138 173 244 / 0.15) !important; }
.catppuccin-macchiato .dark\:bg-blue-900\/30  { background-color: rgb(138 173 244 / 0.2) !important; }
.catppuccin-macchiato .dark\:bg-blue-900\/40  { background-color: rgb(138 173 244 / 0.25) !important; }

.catppuccin-macchiato .dark\:hover\:bg-blue-500\/10:hover { background-color: rgb(183 189 248 / 0.1) !important; }
.catppuccin-macchiato .dark\:hover\:bg-blue-500\/20:hover { background-color: rgb(183 189 248 / 0.2) !important; }
.catppuccin-macchiato .dark\:hover\:bg-blue-500\/30:hover { background-color: rgb(183 189 248 / 0.3) !important; }
.catppuccin-macchiato .dark\:hover\:bg-blue-800\/60:hover { background-color: rgb(138 173 244 / 0.35) !important; }
.catppuccin-macchiato .dark\:hover\:bg-blue-900\/20:hover { background-color: rgb(138 173 244 / 0.15) !important; }
.catppuccin-macchiato .dark\:hover\:bg-blue-900\/30:hover { background-color: rgb(138 173 244 / 0.2) !important; }

.catppuccin-macchiato .dark\:border-blue-500     { border-color: #8aadf4 !important; }
.catppuccin-macchiato .dark\:border-blue-500\/30 { border-color: rgb(183 189 248 / 0.3) !important; }
.catppuccin-macchiato .dark\:border-blue-600     { border-color: #739cf0 !important; }
.catppuccin-macchiato .dark\:border-blue-800     { border-color: #5a78b8 !important; }

.catppuccin-macchiato .dark\:hover\:border-blue-600\/70:hover { border-color: rgb(115 156 240 / 0.7) !important; }

/* --- focus:ring-blue — map to Macchiato Lavender --- */
.catppuccin-macchiato .dark\:focus\:border-blue-500:focus { border-color: #8aadf4 !important; }
.catppuccin-macchiato .dark\:focus\:ring-blue-500:focus { --tw-ring-color: #8aadf4 !important; }
.catppuccin-macchiato .dark\:outline-blue-500 { outline-color: #8aadf4 !important; }
.catppuccin-macchiato .dark\:caret-gray-100 { caret-color: #cad3f5 !important; }
```

- [ ] **Step 4: Type-check and build**

```bash
npx tsc --noEmit 2>&1 | head -20
npm run build 2>&1 | tail -10
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.css
git commit -m "style(theme): rename obsidian→catppuccin-mocha, catppuccin→catppuccin-frappe, add macchiato"
```

---

### Task 3: Update SettingsModal theme picker

**Files:**
- Modify: `src/components/modals/SettingsModal.tsx`

- [ ] **Step 1: Replace theme options array**

Find this block in `SettingsModal.tsx` (around line 271–275):

```tsx
{ value: 'light',      labelEn: 'Light',      labelDe: 'Hell',       preview: 'bg-white border-gray-300 text-gray-800' },
{ value: 'dark',       labelEn: 'Dark',       labelDe: 'Dunkel',    preview: 'bg-gray-800 border-gray-600 text-gray-100' },
{ value: 'obsidian',   labelEn: 'Obsidian',   labelDe: 'Obsidian',  preview: 'bg-[#1e1e2e] border-[#45475a] text-[#cdd6f4]' },
{ value: 'abyss',      labelEn: 'Abyss',      labelDe: 'Abyss',     preview: 'bg-black border-[#2a2a2a] text-[#f0f0f0]' },
{ value: 'catppuccin', labelEn: 'Catppuccin', labelDe: 'Catppuccin', preview: 'bg-[#303446] border-[#51576d] text-[#c6d0f5]' },
```

Replace with:

```tsx
{ value: 'light',                labelEn: 'Light',               labelDe: 'Hell',                preview: 'bg-white border-gray-300 text-gray-800' },
{ value: 'dark',                 labelEn: 'Dark',                labelDe: 'Dunkel',              preview: 'bg-gray-800 border-gray-600 text-gray-100' },
{ value: 'abyss',                labelEn: 'Abyss',               labelDe: 'Abyss',               preview: 'bg-black border-[#2a2a2a] text-[#f0f0f0]' },
{ value: 'catppuccin-frappe',    labelEn: 'Catppuccin Frappé',   labelDe: 'Catppuccin Frappé',   preview: 'bg-[#303446] border-[#51576d] text-[#c6d0f5]' },
{ value: 'catppuccin-macchiato', labelEn: 'Catppuccin Macchiato',labelDe: 'Catppuccin Macchiato',preview: 'bg-[#24273a] border-[#494d64] text-[#cad3f5]' },
{ value: 'catppuccin-mocha',     labelEn: 'Catppuccin Mocha',    labelDe: 'Catppuccin Mocha',    preview: 'bg-[#1e1e2e] border-[#45475a] text-[#cdd6f4]' },
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/modals/SettingsModal.tsx
git commit -m "feat(settings): show all 3 catppuccin dark flavors in theme picker"
```

---

### Task 4: Verify in browser

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

Open `http://localhost:5173` in browser.

- [ ] **Step 2: Check each theme**

Open Settings → Display tab → Theme section. Verify 6 swatches appear:
- Light, Dark, Abyss, Catppuccin Frappé, Catppuccin Macchiato, Catppuccin Mocha

Click each Catppuccin swatch and confirm the app background changes:
- Frappé: `#303446` (blue-gray)
- Macchiato: `#24273a` (darker blue-gray)
- Mocha: `#1e1e2e` (darkest)

- [ ] **Step 3: Check localStorage migration**

In browser DevTools Console:
```javascript
localStorage.setItem('theme', 'obsidian');
location.reload();
// App should load with Mocha theme active
localStorage.getItem('theme'); // should return 'catppuccin-mocha'

localStorage.setItem('theme', 'catppuccin');
location.reload();
// App should load with Frappé theme active
localStorage.getItem('theme'); // should return 'catppuccin-frappe'
```

- [ ] **Step 4: Check cycle button**

Click the theme cycle button in the Layout header — verify it cycles through all 6 themes in order: `light → dark → abyss → catppuccin-frappe → catppuccin-macchiato → catppuccin-mocha → light`.
