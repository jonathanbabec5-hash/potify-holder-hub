# POTIFY Greenhouse and Holder Hub
## Whitepaper · public developer edition

**November 25, 2026 · Application source, local beta**

### Goal and audience

Give members a place to record contributions and view non-transferable Seeds. The immediate audience is community organizers and quest designers.

### Design and implementation

The Node server uses SQLite and signature verification, then records quest submissions and review decisions. The public client reads these states. Keep quest review separate from issuing Seeds. The SQLite transaction groups the decision with its reward so a second review cannot simply pay the same quest twice.

### What a contributor can establish

All six original beta tests passed using the standalone application and fixture data. Test on a new database and retain old-schema compatibility work for staging. The holder-keyed schema and the multi-wallet proposal have different migration needs.

### Evidence and outstanding work

This wallet-keyed beta predates the multi-wallet ID pilot. Existing member data and production migration remain separate. The next acceptance case is concrete. Use the test suite to check submissions, authorized review and a non-duplicated reward.

### Place in POTIFY

Test interest in an organizer-managed community season with a paid hosting or support fee. The marketing plan gives the test window and the evidence for a commercial outcome.

[Source provenance](source.json) · [Build log](BUILD-LOG.md) · [Marketing plan](MARKETING.md)
