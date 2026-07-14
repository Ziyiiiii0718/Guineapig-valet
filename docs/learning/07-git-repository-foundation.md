# 07. Git Repository Foundation

## What This Feature Does

The repository now has ignored files, project documentation, and uncommitted changes ready for review.

## Why It Is Needed

A portfolio project must be reviewable. Git history should show small, intentional phases, not accidental generated files or secrets.

## Complete Request and Data Flow

```text
Developer edits files -> git status shows reviewable changes -> user reviews -> commit only when explicitly requested
```

## Important Files

- `.gitignore`
- `AGENTS.md`
- `README.md`
- `docs/PROJECT_PLAN.md`

## Responsibilities

`.gitignore` keeps generated and secret files out of Git. `AGENTS.md` preserves working rules. Documentation explains how to run and understand the project.

## Concepts

Intuitive: Git is the project time machine.

PiggieVault example: Phase 1A should be one understandable set of changes.

Technical: commits record snapshots, remotes connect to GitHub, and ignored files prevent noisy or dangerous artifacts from being tracked.

Interview explanation: "I keep changes small and documented so reviewers can understand the project evolution."

## Why This Implementation Was Chosen

The user explicitly requested no commit or push. Leaving changes unstaged supports review.

## Alternatives and Trade-offs

Commit immediately: cleaner checkpoint, but violates the instruction. Track generated folders: reproducibility problem. Ignore too much: important source files may be missed.

## Security, Privacy, Performance, Failure

The ignore file excludes `.env`, `.next`, `node_modules`, logs, and OS metadata. The final status must be reported honestly.

## Common Mistakes

- Committing secrets.
- Committing `node_modules`.
- Running force push casually.
- Mixing unrelated work in one commit.
- Claiming a clean Git state when files are untracked.

## Interview Questions

1. Why no commit yet? The task explicitly said not to commit.
2. Why use `.gitignore`? To keep generated and secret files out of history.
3. What is a remote? A linked repository such as GitHub.
4. Why small phases? They are easier to review and debug.
5. What should a README do? Explain purpose, setup, status, and limits.

## How I would explain this feature in 60 seconds.

This phase sets up the repository as a real portfolio project. I added ignore rules for dependencies, build output, and secrets; created documentation so the project can be understood by a reviewer; and left all changes uncommitted because the user requested review first. The goal is a clean foundation where future commits can each tell a clear story.

## Glossary

- Commit: saved Git snapshot.
- Remote: external Git repository.
- `.gitignore`: file listing paths Git should ignore.
- Untracked file: file not yet added to Git.
- Working tree: current local files.
