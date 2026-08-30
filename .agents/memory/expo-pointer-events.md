---
name: Expo decorative pointer events
description: Expo React Native treats View pointerEvents as deprecated on web.
---

Use `style.pointerEvents: 'none'` for decorative React Native layers instead of the `pointerEvents` View prop.

**Why:** The Expo/RN web runtime warns about the prop form, while the style form preserves non-interactive artwork without adding noisy browser warnings.

**How to apply:** Set the style on backdrops, rules, orbit artwork, and other purely visual layers so permission and evidence controls retain the touch surface.