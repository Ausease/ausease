---
name: Deployment schema drift contract
description: How deployment-critical database columns are validated before release
---

The release gate uses an explicit, reviewed column contract and compares it with PostgreSQL metadata using read-only queries. Keep the contract synchronized with intentional schema changes so additions cannot silently escape the pre-publish check.

**Why:** A disposable database can be provisioned successfully even when a published database is stale; metadata comparison is what detects missing or incorrectly configured columns before runtime.

**How to apply:** Extend the contract whenever application code begins depending on a deployment-critical column, and preserve the read-only check when adding production verification.