---
name: pre-publish-check
description: Runs TypeScript compilation and Next.js build checks to prevent build failures on Vercel/GitHub before committing/pushing changes.
---

# Pre-Publish Verification Skill

This skill enforces verification of code correctness before pushing to remote repositories. This prevents Vercel build failures and broken deployments.

## Instructions

Whenever you are about to run a `git push` or perform a deployment, you MUST execute the following verification script in the repository root:

```bash
./scripts/pre_push_check.sh
```

If the script fails, DO NOT push. Fix the issues reported by the compiler or build system, and run the script again until it succeeds.
