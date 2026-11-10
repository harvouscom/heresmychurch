# Production release workflow

Production deployments replace the complete Worker and site bundle. An email-only change built from an older branch can therefore restore an older map design even when the email code is correct.

1. Make changes on a `codex/` branch in its own worktree.
2. Open a PR, run the relevant checks, and compare the complete preview with the approved current design.
3. Coordinate deployment ownership with any other active session.
4. Merge the PR. In a clean release checkout, fetch main and check out the exact merged `origin/main` commit.
5. Run `pnpm run deploy` for the frontend and `pnpm run deploy:api` when the API changed. Both paths run `scripts/check-deploy-ref.mjs`; it rejects dirty checkouts and unmerged/outdated commits.
6. Verify the current live map, church panel, report pages, and any changed feature. Keep the deployed version ID with the release record.

Do not bypass these steps by directly calling Wrangler from an old worktree. `HMC_DEPLOY_FORCE=1` is reserved for a specific user-authorized emergency rollback.

The restoration release includes the completed map/report/SEO/touch-input work and the email feature already in production. The separate church portal/data-health feature remains in progress and is deliberately excluded from this restoration.
