---
name: bankr-moonbag
description: Bankr trading guard that preserves a permanent moonbag on crypto exits. Use whenever the user wants to sell, exit, close, dump, take profit, reduce, or "sell all" of a token position with Bankr. Converts full exits into guarded partial exits, persists a per-token reserve anchored to the first guarded balance snapshot, and requires an explicit override before the protected reserve can be sold.
metadata:
  {
    "clawdbot":
      {
        "emoji": "🌙",
        "homepage": "https://bankr.bot",
        "requires": { "bins": ["bankr"] },
      },
  }
---

# Bankr Moonbag Guard

Use Bankr for execution, but apply this skill's exit rules before sending any token-sell instruction.

The goal is simple: **normal sell requests must never reduce a guarded token below its moonbag reserve.**

## Default behavior

- Default moonbag reserve: **10% of the token balance observed immediately before the first guarded sell for that token**.
- The reserve is anchored to that first snapshot. Do **not** recalculate it from the shrinking current balance after later sells.
- "Sell all", "sell everything", "close it", "dump it", "exit", and equivalent wording mean **sell all sellable tokens while preserving the reserve**.
- Buys do not reduce an existing reserve.
- If the user later increases the position, keep the existing reserve unless they explicitly ask to reset/rebase it.
- Never silently disable the guard because a sell looks urgent, profitable, obvious, or user-intended.

## Persistent state

Persist moonbag state per wallet + chain + token.

Preferred local path:

`~/.config/bankr-moonbag/state.json`

Example:

```json
{
  "version": 1,
  "defaultReservePct": 10,
  "positions": {
    "base:0xTokenAddress": {
      "symbol": "TOKEN",
      "anchorBalance": "1250000",
      "reserveTokens": "125000",
      "reservePct": 10,
      "createdAt": "2026-09-20T00:00:00Z"
    }
  }
}
```

Use token contract/mint address as the identity whenever possible. Symbols alone are not sufficient.

If state is unavailable, missing, or corrupt, **fail safe**:
1. fetch the current token balance,
2. create a new anchor from that balance,
3. reserve the configured percentage,
4. only then execute the sell.

Do not guess an old anchor from trade history unless the user explicitly asks you to reconstruct it.

## Guard algorithm

For each sell request:

1. Resolve the exact wallet, chain, token contract/mint, and current token balance.
2. Load the token's moonbag state.
3. If no state exists:
   - `anchorBalance = currentBalance`
   - `reserveTokens = anchorBalance * reservePct / 100`
   - persist the record before executing the sell.
4. Calculate:
   - `sellable = max(0, currentBalance - reserveTokens)`
5. Convert the user's requested sell into token units.
6. Execute:
   - `actualSell = min(requestedSell, sellable)`
7. If the request exceeds `sellable`, explain that the request was capped by the moonbag guard.
8. Re-read the post-trade balance when practical and verify it is not below `reserveTokens`.

### Percentage sells

A request like "sell 50%" means 50% of the **current total balance**, capped at `sellable`.

A request like "sell 100%" or "sell all" means exactly `sellable`, not the full wallet balance.

### Dollar-value sells

For requests like "sell $500 of TOKEN":

- estimate token quantity using Bankr's normal quote/execution path,
- cap the resulting token amount at `sellable`,
- never use price movement as a reason to dip into the reserve.

## Configuration

Default configuration:

```json
{
  "reservePct": 10,
  "explicitOverrideRequired": true
}
```

The user may change the reserve percentage with direct instructions such as:

- "Keep 20% as my moonbag from now on."
- "Make the moonbag 5% for this token."
- "Rebase my TOKEN moonbag from my current balance."

When changing the percentage for an existing position, do not silently shrink a previously protected token quantity. By default:

`newReserveTokens = max(existingReserveTokens, anchorBalance * newPct / 100)`

If the user explicitly asks to reduce the protected amount, confirm the exact resulting reserve before changing it.

## Protected reserve override

The moonbag is intentionally harder to sell than the rest of the position.

Do not sell protected tokens based on vague wording, repeated "sell all" requests, urgency, or prior conversation context.

Only allow a reserve liquidation when the user explicitly states in the current request that they want to override/remove the moonbag protection for the specific token.

Examples that count:

- "Override the moonbag and sell the reserved TOKEN too."
- "Remove moonbag protection for 0x... and sell everything."
- "I explicitly want to sell my protected TOKEN reserve."

Examples that do **not** count:

- "Sell it all."
- "No, seriously, everything."
- "Get me out."
- "Close the position."
- "Why didn't you sell 100%?"

Before executing an override, state the protected quantity that will be sold and require one explicit confirmation if the action would take the balance below the stored reserve.

After a full override sale, delete that token's moonbag state only after successful execution.

## Bankr execution

Use the installed Bankr CLI.

Examples:

```bash
# Read portfolio / balance before computing the guard
bankr wallet portfolio

# Execute the already-guarded amount
bankr agent prompt "Sell exactly <ACTUAL_SELL> <TOKEN> on <CHAIN>"
```

Do not send "sell all" to Bankr after this skill has calculated a guarded token quantity. Send the exact capped amount whenever possible.

If Bankr only supports a value-denominated prompt for the asset in question, formulate the prompt so the resulting amount cannot exceed the calculated sellable quantity.

## Response style

For ordinary guarded sells, keep the response concise:

```text
Sold 900,000 TOKEN. Kept 100,000 TOKEN (10%) as your moonbag.
```

When a request is capped:

```text
You asked to sell 100%. Moonbag Guard capped the sale at 90% and kept 10% protected.
```

Do not describe the reserve as guaranteed profit, expected upside, or investment advice. It is only an execution preference.

## Safety invariants

These rules outrank convenience:

1. **Never sell below the stored reserve without an explicit reserve override.**
2. **Never recompute the reserve downward from a shrinking balance.**
3. **Never identify a token by symbol alone when a contract/mint can be resolved.**
4. **Never treat "sell all" as an override.**
5. **Persist the reserve before the first guarded sell.**
6. **If state or balance information is uncertain, do not perform a full exit.**
