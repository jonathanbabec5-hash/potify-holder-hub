# POTIFY Greenhouse and Holder Hub

[Complete repository directory tree](docs/DIRECTORY.md)

## Giving credit for the same good deed exactly once

A quest is a small promise between a contributor and an organizer: do the work, show what happened, receive a fair review. In the Greenhouse the most revealing case is the second review of the same quest. A community should be able to recognize a contribution without counting it twice.

Read the [local beta server](server.mjs) with the [hub tests](tests/hub.test.mjs). SQLite ties the review decision to the award. These Seeds are non-transferable community points; the older wallet-keyed beta and the later multi-wallet identity pilot have different data models.

Use the synthetic tests to trace one submission, one authorized review and an attempted repeat. Report the visible state after both attempts. Actual membership records and production migrations belong outside a public fixture.

**Application source, local beta.** Give members a place to record contributions and view non-transferable Seeds.

### Setup and usage

Use Node.js 24 for the included checks.

```sh
npm start
```

Try one demonstration quest. Open http://localhost:8787 in a browser. 

### Developer entry points

The Node server uses SQLite and signature verification, then records quest submissions and review decisions. The public client reads these states. Explore `public/`, `tests/` in the full tree.

### Verification

All six original beta tests passed using the standalone application and fixture data.

```sh
node --test tests/hub.test.mjs
```

### Release scope

This wallet-keyed beta predates the multi-wallet ID pilot. Existing member data and production migration remain separate. potify-holder-hub-standalone.zip. Self-hosted Node/SQLite beta with example configuration and synthetic test fixtures.

[Technical whitepaper](docs/WHITEPAPER.md) · [Marketing and sales plan](docs/MARKETING.md) · [Dated developer log](docs/BUILD-LOG.md)

Existing asset and code terms remain applicable. Public access to a recording, illustration, brand or manuscript does not itself grant commercial reuse rights.
