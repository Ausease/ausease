---
name: API codegen Zod compatibility
description: OpenAPI integer schemas can generate syntax for a newer Zod API than this workspace uses.
---

OpenAPI integer fields may be emitted as `zod.int()` by the current generator, while the workspace Zod version requires `zod.number().int()`.

**Why:** Library typechecking fails after otherwise successful code generation when generated validation code uses the unavailable helper.

**How to apply:** After API codegen adds integer schemas, run the library typecheck and normalize generated validation output or adjust the generator configuration before relying on the generated client.