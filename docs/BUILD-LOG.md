# November 25, 2026 · POTIFY Greenhouse and Holder Hub

**Question.** Give members a place to record contributions and view non-transferable Seeds.

**Source and change.** potify-holder-hub-standalone.zip. Self-hosted Node/SQLite beta with example configuration and synthetic test fixtures.

**Observed result.** All six original beta tests passed using the standalone application and fixture data.

```sh
node --test tests/hub.test.mjs
```

**Next acceptance check.** Use the test suite to check submissions, authorized review and a non-duplicated reward.

**Owner and decision.** Chance owns the public release and approves campaign copy. This wallet-keyed beta predates the multi-wallet ID pilot. Existing member data and production migration remain separate.

This dated record describes the developer package. Verify remote commit and tree in the publication receipt before announcing a GitHub release.
