# Recent Project Switcher Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a recent-project switcher in the top-right corner plus `⌘ + ←/→` project cycling for faster multi-project navigation.

**Architecture:** Keep the backend project registry unchanged and implement recent-order behavior in the frontend store. Persist recent activation order in `localStorage`, reuse existing `projects` data as the source list, and surface the ordered list both in the tab bar menu and keyboard switching.

**Tech Stack:** React 19, Zustand, Vitest, Testing Library, Tauri bridge helpers

---

### Task 1: Define the recent-project model

**Files:**
- Create: `src/features/workspace/project-recents.ts`
- Test: `src/features/workspace/project-recents.test.ts`

1. Write failing tests for merging project ids with stored recency and bumping the active project to the front.
2. Run: `pnpm test src/features/workspace/project-recents.test.ts`
3. Implement minimal pure helpers for read/write/order/bump.
4. Run: `pnpm test src/features/workspace/project-recents.test.ts`

### Task 2: Wire recent ordering into the workspace store

**Files:**
- Modify: `src/stores/workspace-store.ts`
- Test: `src/stores/workspace-store.test.ts`

1. Write failing tests that prove bootstrap/select keep projects in recent-first order.
2. Run: `pnpm test src/stores/workspace-store.test.ts`
3. Implement minimal store integration and a project cycling action.
4. Run: `pnpm test src/stores/workspace-store.test.ts`

### Task 3: Add the tab-bar menu and keyboard shortcut

**Files:**
- Modify: `src/components/workspace-tab-bar.tsx`
- Modify: `src/components/workspace-tab-bar.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Create or update: `docs/workspace/recent-project-switcher.md`

1. Write failing UI tests for the recent-project trigger/menu and `⌘ + ←/→` switching.
2. Run: `pnpm test src/components/workspace-tab-bar.test.tsx src/App.test.tsx`
3. Implement the menu, project activation hook-up, and keyboard handler.
4. Run: `pnpm test src/components/workspace-tab-bar.test.tsx src/App.test.tsx`
5. Update the feature doc to reflect the new interaction.
