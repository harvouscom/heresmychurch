# Shared workspace and production releases

- Use a separate worktree and a `codex/` branch for each feature or fix. Preserve other sessions' uncommitted work.
- Open a pull request for production changes. Coordinate with other active sessions before publishing shared application changes.
- Deploy production only from a clean checkout whose HEAD is exactly the latest merged `origin/main`. Use the project's guarded deploy scripts. Do not deploy an older feature branch just because it contains main as an ancestor.
- Never override release checks unless the user explicitly authorizes a specific emergency rollback.
- Build the complete site from that same merged checkout. Compare the candidate with the current approved design before publishing; a focused feature release still replaces the entire site.
- Keep in-progress features on their own branches until they are ready to merge. Do not include another session's unfinished feature just to make a release checkout clean.
