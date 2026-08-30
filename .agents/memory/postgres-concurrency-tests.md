---
name: PostgreSQL concurrency tests
description: Requirements for reliable live database tests of tenant-scoped operation mutations.
---

Live operation-concurrency fixtures must create and clean up their organization and store parent rows before inserting operation records, because tenant foreign keys are enforced. Rebuild the DB package declarations after schema changes before typechecking dependent packages.

**Why:** A policy-only test can pass while a live fixture fails at the database boundary or dependent packages read stale generated declarations.

**How to apply:** Keep race tests tenant-isolated, assert the database row and audit row directly, and run the DB package build before the API package checks.