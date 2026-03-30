# Theme Command Palette Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a VS Code-style global command palette, move themes into JSON-backed modules, and ship a switchable `GitHub Dark Default` theme alongside the existing warm Flowterm theme.

**Architecture:** Introduce a small theme registry that reads normalized JSON theme payloads and exposes CSS variable tokens, xterm colors, syntax colors, and document metadata from one source of truth. Add a focused command palette component that models the VS Code flow `⌘⇧P → Preferences: Color Theme → theme list`, then wire it to the app shell and persisted workspace state.

**Tech Stack:** React 19, TypeScript, Zustand, Vitest, Testing Library

---

### Task 1: Lock theme registry behavior

**Files:**
- Create: `src/features/theme/theme-registry.test.ts`
- Create: `src/features/theme/theme-registry.ts`
- Create: `src/themes/flowterm-warm-dark.json`
- Create: `src/themes/github-dark-default.json`

**Step 1: Write the failing test**

Assert that the registry exposes both themes and that the GitHub theme resolves the expected surface, terminal, and syntax tokens.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/features/theme/theme-registry.test.ts`

**Step 3: Write minimal implementation**

Create a normalized theme shape plus helper functions to resolve theme metadata and CSS variable maps from JSON files.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/features/theme/theme-registry.test.ts`

### Task 2: Lock command palette flow

**Files:**
- Create: `src/components/command-palette.test.tsx`
- Create: `src/components/command-palette.tsx`

**Step 1: Write the failing test**

Assert that the palette first shows `Preferences: Color Theme`, then reveals the theme list, and selecting `GitHub Dark Default` calls the theme change handler.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/command-palette.test.tsx`

**Step 3: Write minimal implementation**

Build a keyboard-friendly command palette with search, highlighted selection, enter-to-open, escape-to-close, and a dedicated color-theme submenu.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/components/command-palette.test.tsx`

### Task 3: Wire app state and document theming

**Files:**
- Modify: `src/lib/contracts.ts`
- Modify: `src/features/workspace/project-memory.ts`
- Modify: `src/stores/workspace-store.ts`
- Modify: `src/components/workspace-terminal.tsx`
- Modify: `src/features/workspace/preview-syntax.ts`
- Modify: `src/index.css`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`

**Step 1: Write the failing test**

Assert that `⌘⇧P` opens the palette in the app and that choosing `GitHub Dark Default` updates the document theme marker.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/App.test.tsx`

**Step 3: Write minimal implementation**

Persist the selected theme in workspace state, apply CSS variables and `color-scheme` to `document.documentElement`, and pass the active terminal/syntax theme through existing components.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/App.test.tsx`

### Task 4: Run focused verification

**Files:**
- Modify: `docs/workspace/theme-system.md`

**Step 1: Verify the focused suite**

Run:
- `npm test -- src/features/theme/theme-registry.test.ts src/components/command-palette.test.tsx src/App.test.tsx`

**Step 2: Verify the broader frontend suite**

Run:
- `npm test`

**Step 3: Refresh docs**

Document the theme JSON shape, current theme ids, and command palette entry points in `docs/workspace/theme-system.md`.
