# Repository guidance

## Authentication and database changes

For any new or changed authentication or database capability, implement and verify it in `firebase-demo` before rolling it out to individual games. This workflow is recorded in [ADR-0002](firebase-demo/docs/adr/0002-auth-db-development-workflow.md).

1. Prototype the capability in `firebase-demo` and add automated tests for its expected behavior and failure/authorization cases.
2. For Firestore security-rule changes, run the Firestore Emulator tests from `firebase-demo` with `npm ci` and `npm test`.
3. Do not roll the capability out to individual games until the relevant `firebase-demo` tests pass. Add and run tests for game-specific integration behavior as well.
4. If the prototype or its tests cannot be completed, pause the game rollout and report what remains unverified and why.

Apply this sequence to all contributors and AI agents working in this repository.
