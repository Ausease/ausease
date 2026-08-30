---
name: Operations assistant safety
description: Durable rules for interpreting retail operations requests safely.
---

Natural-language operations requests should be classified on intent and context rather than exact phrases. Delegation is a side effect: require a named employee and confirmation for ambiguous or destructive requests.

**Why:** Retail task assignment affects real people and store accountability, so a confident but incorrect recipient is worse than asking a clarifying question.

**How to apply:** Keep read-only answers and SOP guidance available from live store context, but gate task creation on an explicit owner and preserve an audit event for every assistant request.