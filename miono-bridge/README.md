# Miono Bridge

Telegram-controlled batch bridge/swap operator for paired EVM/Solana wallets.

## Routes

- Base → Solana
- Solana → Base
- Robinhood Chain → Solana
- Solana → Robinhood Chain
- Base → Robinhood Chain
- Robinhood Chain → Base

## What works in this first pass

- `/bridge` Telegram menu
- source/destination selector
- select one, several, or all wallet pairs
- paired EVM/Solana destination routing
- Relay quote aggregation
- per-wallet quote summary
- explicit batch confirmation
- sequential execution engine
- EVM signing via viem
- Solana signing via Relay Solana adapter
- execution OFF by default

## Safety

Private keys do not belong in Git, Telegram, wallets.json, logs, or screenshots.
The wallet registry stores public addresses plus environment-variable key references only.

`BRIDGE_EXECUTION_ENABLED=0` is the default. Do not enable execution until each route has been tested with a tiny amount.

## Setup

```bash
cp .env.example .env
cp wallets.example.json wallets.json
npm install
npm run typecheck
npm run dev
```

Fill `wallets.json` with public wallet pairs and secret references. Put the referenced secrets only in the server environment or secret manager.

## Chain identifiers

- Base: 8453
- Robinhood Chain: 4663
- Solana Relay identifier: 792703809

## Next pass

- token pickers instead of native-token defaults
- human amount parsing such as `0.1 ETH`, `50%`, `max`
- balance checks before quote
- USDC presets
- quote expiry timer
- receipt/history storage
- retry failed wallets only
- per-wallet gas reserve policy
- self-update command
- server triage commands
