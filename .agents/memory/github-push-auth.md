---
name: GitHub push authentication
description: Difference between GitHub connector access and Git remote authentication in this workspace
---

**Rule:** Verify Git remote authentication separately from the GitHub connector. A working connector does not guarantee that `git push` can authenticate to an HTTPS remote.

**Why:** Binding the account's existing GitHub connector did not resolve an HTTPS push failure on this workspace's remote. Repeating the connector setup would not address the separate Git credential problem.

**How to apply:** When a future push reports invalid credentials, keep the local commit intact and ask for the account-level GitHub/Git connection to be repaired. Do not ask for a token in chat or assume a healthy connector repaired Git CLI authentication.