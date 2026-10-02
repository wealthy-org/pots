# POTS Indexer

Envio HyperIndex project for Robinhood Chain testnet (chain ID 46630).

## Envio Cloud settings

- Root directory: `indexer`
- Config file: `config.yaml` (relative to the root directory, not `indexer/config.yaml`)
- Deployment branch: `main`

- Envio Cloud builds and deploys this folder from the repository root `indexer/`.
- Local CLI runs require WSL2 or Docker because the Envio CLI has no native Windows binary (L-96), so the first codegen and build validation happen on Envio Cloud.
- `config.yaml` references the placeholder address `0x0000000000000000000000000000000000000000` until `PotsRoundManager` is deployed to a funded chain; replace it before real indexing.
- `schema.graphql` defines the read-model entities and `src/handlers/EventHandlers.ts` maps every manager event into them.
- If the Envio Cloud build rejects the npm-only repository (L-97), add a pnpm lockfile inside this folder only.
