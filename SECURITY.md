# Security

Please report a security problem privately to the association's administrator rather than opening a public issue.
Include what you found and how to reproduce it. Do not include resident data in the report.

Design notes for reviewers:
- The browser and the backend use only the Supabase *anon* key plus each member's own JWT; row-level-security policies in
  `supabase/schema.sql` are the authority on who may read or change a row.
- Sessions live in a Fernet-encrypted, HttpOnly, SameSite=Lax cookie (`HBA_SESSION_KEY`), idle limit 12 hours, absolute
  limit 7 days. Member API calls also need the per-session `X-HBA-Proof` header, which other sites cannot read.
- The sign-in page, member app and API share one origin; pages may be framed only by that origin
  (`X-Frame-Options: SAMEORIGIN`, `frame-ancestors 'self'`).
- Temporary passwords are never logged or displayed after issue.
