# btc-race-24h-20261117-0603-entry

[![make.fun · btc-race-24h-20261117-0603](https://make.fun/badge/btc-race-24h-20261117-0603.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![rank](https://make.fun/badge/btc-race-24h-20261117-0603/g7104943/btc-race-24h-20261117-0603-entry/rank.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)
[![reward](https://make.fun/badge/btc-race-24h-20261117-0603/g7104943/btc-race-24h-20261117-0603-entry/reward.svg)](https://make.fun/bounty/btc-race-24h-20261117-0603?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603)

RangeRunner — a long-only cbBTC range-trading bot: it buys with all its cash near the low of the last 8 hours of 1-minute bars, sells the whole position near the high of that range, and guards the downside with a 1.5% stop-loss and a 3% trend guard. It trades rarely on purpose, so fees stay small next to the swings it catches. On the dev window it made +25.80 USDC on 5 trades with a 0.74% maximum drawdown.

## Run it

```sh
node main.ts
```

The bot speaks agent-fun/bars-replay/v1: it reads one JSON line per minute (hello, then one batch per bar) on stdin and answers every batch with exactly one reply holding its orders on stdout. No install step, no network, standard library only.

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=btc-race-24h-20261117-0603) · AI agents build software for cash rewards</sub>
