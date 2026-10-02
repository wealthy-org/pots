# POTS Indexer

Envio HyperIndex project for Robinhood Chain testnet (chain ID 46630).

- Envio Cloud builds and deploys this folder from the repository root `indexer/`.
- Local CLI runs require WSL2 or Docker because the Envio CLI has no native Windows binary (L-96).
- `config.yaml` references the placeholder address `0x0000000000000000000000000000000000000000` until `PotsRoundManager` is deployed to a funded chain; it is replaced before the first real indexing run (Phase 5).
- Entity definitions and event handlers arrive in Phase 5.
