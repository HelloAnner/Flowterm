# Flowterm

<p align="center">
  <img src="./src/assets/hero.png" alt="Flowterm hero" width="220" />
</p>

<p align="center">
  A terminal-first desktop workspace for AI coding agents.
</p>

<p align="center">
  Run the agent in one place. See the file tree, diffs, and terminal output without leaving the terminal workflow.
</p>

## Introduction

Flowterm is a local desktop app built with Tauri, React, TypeScript, and Rust.
It is designed for developers who already work with CLI agents such as Claude Code, aider, or OpenCode, but want more visibility into what those agents are changing while they run.

Most current tools force a split workflow:

- stay in the terminal and lose sight of file changes
- switch back to an editor and break the flow

Flowterm is built around a simpler idea:

> the terminal stays at the center, and visibility becomes ambient infrastructure around it

Instead of turning the workflow into a full IDE, Flowterm keeps the terminal as the main surface and adds just enough structure around it to make agent work legible and reviewable.

## Design Philosophy

Flowterm is shaped by a few consistent principles.

### Less but Better

Every surface must justify its existence.
The app is not trying to become a replacement for a code editor.
It strips the experience down to the parts that matter most during agent work: terminal, structure, and change.

### Terminal-First, Not Terminal-Only

The terminal is the protagonist.
The rest of the interface exists to support it, not compete with it.
Diffs, file structure, and status should feel like extensions of the terminal workflow, not a separate mode.

### Warm, Calm, Human

Flowterm avoids cold dashboard aesthetics.
Its visual direction is intentionally quiet: warm neutrals, restrained contrast, soft emphasis, and interfaces that recede until needed.
Errors should feel informative, not alarming.

### Believable Infrastructure

The product should feel local, direct, and unsurprising.
No heavy abstraction for its own sake.
No magical behavior that is hard to explain.
The architecture is meant to stay readable and grounded as the product grows.
