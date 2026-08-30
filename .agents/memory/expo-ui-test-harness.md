---
name: Expo UI test harness
description: Constraints for rendering Expo React Native screens in the Node test runner.
---

Expo screen interaction tests run through the workspace's CommonJS TypeScript test path. Mock native modules before dynamically importing screens, and resolve shared providers through the same CommonJS package entry used by the screen to avoid duplicate React contexts.

**Why:** React Native's Flow syntax is not directly executable in the Node runner, and React Query's ESM/CJS dual entry can otherwise make a provider appear missing even when the test renders one.

**How to apply:** Keep native-module mocks local to UI tests, use React Test Renderer with the production provider composition where possible, enable Node's experimental module mocks in the test script, and flush async state updates inside `act`.

When a UI test renders authenticated providers, the web AsyncStorage adapter needs a minimal `window.localStorage` implementation even if the provider soon switches into demo mode.

**Why:** Provider initialization can run its signed-in hydration effect before demo state settles, and the Node runner has no browser window.

**How to apply:** Define an in-memory `window.localStorage` boundary in the test before rendering the provider tree; do not change production storage code for this test-only environment gap.