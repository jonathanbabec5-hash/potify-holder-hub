# POTIFY Greenhouse and Holder Hub

[Complete repository directory tree](docs/DIRECTORY.md)

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
