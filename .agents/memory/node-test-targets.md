---
name: Node test targets
description: Distinguishing test-runner target resolution failures from failing tests
---

**Rule:** Use an explicit test-file glob when running the board suite in this workspace, rather than passing its directory to Node's test runner.

**Why:** Node 24.13 treated the directory target as a module and failed resolution even though the individual test files were present and all passed. That failure was not a failing test assertion.

**How to apply:** Run `node --test tests/boards/*.test.js` and report its assertion results separately from the unsupported directory invocation. Do not switch the whole app to ES modules just to silence module-detection warnings; the existing app is CommonJS and the current runtime already loads the merged ES-module helpers.