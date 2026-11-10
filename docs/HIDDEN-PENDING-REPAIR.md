# Hidden pending proposals — November 10, 2026

Five early suggestion records lacked `churchId` even though the KV key identified the church. Global and regional review readers skipped these records. Migration 0004 restores the identifier from the key, preserves all proposal data, and increments the revision to invalidate in-flight stale saves.

Six restored proposals (five websites and the Faith Promise Knoxville address) were approved through normal moderator endpoints. Existing accepted campus links and websites were already in primary storage: the public pending endpoint had continued to label their historical votes as awaiting review, while the moderator queue correctly omitted them. The public endpoint now checks the accepted listing using the same comparison rules. It retains genuine replacements and auto-applied proposals with a stored previous value until reviewed. Held sensitive proposals also remain visible in the moderator queue.

Validation: 111 API tests pass, including already-saved campus links/websites, real replacements, previous-value review, held sensitive fields, and legacy identifier repair. No unrelated local UI changes are included.
