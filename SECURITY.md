# Security

Please report a security problem privately to the association's administrator rather than opening a public issue.
Include what you found and how to reproduce it. Do not include resident data in the report.

Design notes for reviewers:
- The browser and the backend use only the Supabase *anon* key plus each member's own JWT; row-level-security policies in
  `supabase/schema.sql` are the authority on who may read or change a row.
- Sessions are stored server-side in an encrypted SQLite file, keyed by a per-browser visitor id (proxy header or first-party cookie).
- Temporary passwords are never logged or displayed after issue.
