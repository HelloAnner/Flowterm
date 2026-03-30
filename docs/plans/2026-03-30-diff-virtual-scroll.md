# Diff Virtual Scroll Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep large diff previews responsive by virtualizing preview rows so the panel only renders the visible slice plus overscan.

**Architecture:** Reuse the existing fixed-row preview model and viewport scheduler. Add a small range calculator for the loaded preview chunk, then update the preview panel to render only the rows that intersect the viewport while preserving text-window requests for clean files.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library

---

### Task 1: Lock viewport range math

**Files:**
- Modify: `src/features/workspace/preview-window.ts`
- Modify: `src/features/workspace/preview-window.test.ts`

**Step 1: Write the failing test**

Assert that the preview viewport resolves a bounded render range for a loaded chunk and clamps correctly when the scroll position lands near the chunk edges.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/features/workspace/preview-window.test.ts`

**Step 3: Write minimal implementation**

Add a helper that converts viewport metrics into local row indexes for the currently loaded preview chunk.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/features/workspace/preview-window.test.ts`

### Task 2: Render only visible preview rows

**Files:**
- Modify: `src/components/workspace-diff-panel.tsx`
- Modify: `src/components/workspace-diff-panel.test.tsx`

**Step 1: Write the failing test**

Assert that a large diff preview renders only the initial visible rows instead of every line at first paint.

**Step 2: Run test to verify it fails**

Run: `npm test -- src/components/workspace-diff-panel.test.tsx`

**Step 3: Write minimal implementation**

Track viewport metrics in the preview panel, derive a render range from them, and slice both text and diff rows before rendering while keeping the existing text window fetch behavior.

**Step 4: Run test to verify it passes**

Run: `npm test -- src/components/workspace-diff-panel.test.tsx`

### Task 3: Refresh docs and verify

**Files:**
- Modify: `docs/workspace/working-tree-preview.md`

**Step 1: Update the spec**

Document that preview virtualization now applies to diff rows as well as clean-text rows.

**Step 2: Run focused verification**

Run:
- `npm test -- src/features/workspace/preview-window.test.ts src/components/workspace-diff-panel.test.tsx`
- `npm run build`
