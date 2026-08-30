---
name: Tenant access boundaries
description: Authorization and local persistence must be scoped to active store membership.
---

Membership status and membership role are authoritative for enterprise actions; token claims only identify the requested tenant. Signed-out mobile state must reset to starter data and never persist operational snapshots.

**Why:** Store and organization isolation fails if stale claims or shared device storage can outlive the authenticated session.

**How to apply:** Keep active-membership checks on every data-changing or data-reading route, scope queries by both organization and store, and gate local persistence on authenticated hydration.