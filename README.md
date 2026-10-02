# POTS

Grid mining game on Robinhood Chain. Pick squares, deploy ETH, settle with verifiable commit-reveal randomness, claim ETH and POTS.

## Stack

Next.js (App Router), React, TypeScript, Tailwind CSS, Motion. Solidity with Foundry. Envio HyperIndex for history and stats.

## Requirements

- Node.js 24 or newer (npm is included)
- Foundry (`forge`, `cast`) for contracts

## Setup

```bash
npm install
npm run dev
```

## Scripts

| Command                | Purpose                    |
| ---------------------- | -------------------------- |
| `npm run dev`          | Development server         |
| `npm run build`        | Production build           |
| `npm start`            | Serve the production build |
| `npm run lint`         | ESLint                     |
| `npm run typecheck`    | TypeScript check           |
| `npm test`             | Vitest                     |
| `npm run format`       | Prettier write             |
| `npm run format:check` | Prettier check             |

## Contracts

```bash
cd contracts
forge build
forge test
forge fmt
```

## Indexer

The indexer lives in `indexer/` and is built and deployed by Envio Cloud from this repository through its GitHub integration. No local CLI install is required. If a local CLI run is ever needed, use WSL2 or Docker because the Envio CLI has no native Windows binary.

## Credentials

Runtime and deployment credentials are documented in `project-context/credentials.md`, which stays local and is never committed.

## Status

V1 implementation in progress. Phase plans live in `project-context/plans/` (local).
