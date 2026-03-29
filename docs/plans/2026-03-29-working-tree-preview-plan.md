# Working Tree Preview Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the dual live/git diff modes with a single working-tree preview that shows any selected file and refreshes when the file changes.

**Architecture:** Move expensive diff generation out of project snapshot refreshes and into an on-demand file preview command. Keep file tree metadata in the snapshot, then fetch and refresh only the active file preview from the frontend store.

**Tech Stack:** React, TypeScript, Zustand, Tauri 2, Rust

---

### Task 1: Lock selection behavior

**Files:**
- Create: `src/features/workspace/selection.test.ts`
- Create: `src/features/workspace/selection.ts`

**Step 1: Write the failing test**

Assert that a clean file can stay selected and that fallback selection uses the first file in the snapshot, not the first changed file.

**Step 2: Run test to verify it fails**

Run: `pnpm test src/features/workspace/selection.test.ts`

**Step 3: Write minimal implementation**

Extract selection logic into a small helper that only depends on the file list.

**Step 4: Run test to verify it passes**

Run: `pnpm test src/features/workspace/selection.test.ts`

### Task 2: Lock preview generation

**Files:**
- Modify: `src-tauri/src/git.rs`

**Step 1: Write the failing test**

Assert that a clean text file preview returns full line content with matching old/new line numbers.

**Step 2: Run test to verify it fails**

Run: `cargo test --manifest-path src-tauri/Cargo.toml clean_text_preview`

**Step 3: Write minimal implementation**

Add an on-demand file preview builder that returns diff output for changed files and full text lines for clean files.

**Step 4: Run test to verify it passes**

Run: `cargo test --manifest-path src-tauri/Cargo.toml clean_text_preview`

### Task 3: Wire store and UI

**Files:**
- Modify: `src/lib/contracts.ts`
- Modify: `src/lib/tauri.ts`
- Modify: `src/stores/workspace-store.ts`
- Modify: `src/App.tsx`
- Modify: `src/components/workspace-diff-panel.tsx`

**Step 1: Write the failing test**

Drive the new selection helper first, then use existing app-level behavior to expose missing preview state.

**Step 2: Write minimal implementation**

Remove diff mode state, add file preview state, fetch preview on selection and project refresh, and render a single preview panel with status metadata.

**Step 3: Run verification**

Run:
- `pnpm test`
- `cargo test --manifest-path src-tauri/Cargo.toml`
