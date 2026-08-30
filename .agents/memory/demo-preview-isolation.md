---
name: Demo preview isolation
description: The profile switcher is a development-only local walkthrough, never an auth or tenant substitute.
---

Demo profiles must remain local and development-gated. Access requires both an active Clerk team membership and a server-verified private code. The viewer persona is represented with a demo-only key while retaining a production employee role value, so production role enums and authorization policies never expand for preview needs.

**Why:** A fake Clerk session, backend demo user, or new viewer membership role could bypass or weaken the existing tenant and membership guarantees.

**How to apply:** Keep the code in a workspace secret, verify it only on an authenticated API route protected by active membership, keep demo data in the client-only provider, skip live queries and mutations while demo mode is active, reset local operations on profile switch, and preserve the normal Clerk route whenever demo mode is disabled.