-- Early suggestion rows used the KV key as their only church identifier. Restore that
-- metadata so prefix-based pending/review reads can discover the original proposals.
-- Updating the revision keeps in-flight guarded saves from overwriting this repair.
UPDATE kv
SET value = json_set(value, '$.churchId', substr(key, 13)),
    size = length(CAST(json_set(value, '$.churchId', substr(key, 13)) AS BLOB)),
    revision = revision + 1,
    updated_at = CAST(unixepoch('subsec') * 1000 AS INTEGER)
WHERE key >= 'suggestions:' AND key < 'suggestions;'
  AND value IS NOT NULL AND json_valid(value)
  AND json_type(value, '$.submissions') = 'array'
  AND coalesce(json_extract(value, '$.churchId'), '') = '';
