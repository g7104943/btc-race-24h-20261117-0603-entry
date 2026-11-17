// RangeRunner: a long-only cbBTC range-trading bot for agent-fun/bars-replay/v1.
//
// How it works, in one paragraph: the hello message opens the session with the
// universe, the capital, the caps and the fees. After that the harness sends one
// batch per minute, each carrying the bar that just closed, and this bot answers
// every batch with exactly one reply holding its orders for that bar. Orders
// decided on a bar fill at the next bar's open, so every decision here is made
// on closes the bot has already seen, never on a bar still forming.
//
// The idea: on one-minute bars Bitcoin spends most of a day ranging inside a
// band a few percent wide, and a full round trip costs about 26 bps in fees,
// slippage and price impact, so only the big swings inside that band are worth
// trading. The bot watches the last 480 bars (eight hours) of CBBTC, takes the
// lowest low and the highest high of that window as the range, buys with all
// its cash when the close sits in the bottom 15% of the range, and sells the
// whole position when the close reaches the top 15%. Two guards keep it out of
// trouble on an unseen window: it never buys while the price has fallen more
// than 3% across the window (a falling knife, not a range low), it only buys
// on a bar that closed up from the bar before it (the low has started to
// turn, rather than still falling), and it exits on a stop-loss if the close
// drops 1.5% below what its buy actually paid. It
// trades rarely on purpose: five filled round trips on the dev window, so
// costs stay small next to the swings it catches.
//
// Everything here is deterministic: plain float64 arithmetic over the bars
// seen so far, no clock, no environment, no randomness (hello.seed is read
// and ignored, since the strategy needs none). The same bars always produce
// the same orders, so two runs of the entry log identical actions.

import { runBars, type BarsState, type BuyInput, type SellInput } from './vendor/makefun-bars.ts';

const SYMBOL = 'CBBTC';

/** Bars of history the range is read from: 480 one-minute bars, eight hours. */
const WINDOW_BARS = 480;
/** Buy when the close is inside this fraction of the range above its low. */
const BUY_ZONE = 0.15;
/** Sell when the close is inside this fraction of the range below its high. */
const SELL_ZONE = 0.15;
/** Never buy when the close has fallen more than this across the window. */
const TREND_GUARD = 0.03;
/** Stop-loss: sell when the close is this far below the entry close. */
const STOP_LOSS = 0.015;
/** Cap on how far a fill may move from the latest close, in bps. */
const MAX_SLIPPAGE_BPS = 120;

interface SeenBar {
  o: number;
  h: number;
  l: number;
  c: number;
}

/** The last WINDOW_BARS bars, oldest first. */
const history: SeenBar[] = [];

/**
 * Fill price of the current position's buy, in USDC per BTC, or null while
 * flat. The stop-loss is measured from what the buy actually paid, read off
 * the batch's fills, not from the close the order was decided on: the two can
 * differ when the next bar's open gaps.
 */
let entryPrice: number | null = null;

function pushBar(bar: { o: string; h: string; l: string; c: string }): void {
  history.push({ o: Number(bar.o), h: Number(bar.h), l: Number(bar.l), c: Number(bar.c) });
  if (history.length > WINDOW_BARS) history.shift();
}

/** Lowest low and highest high of the window, or null before it is full. */
function range(): { lo: number; hi: number } | null {
  if (history.length < WINDOW_BARS) return null;
  let lo = Infinity;
  let hi = -Infinity;
  for (const b of history) {
    if (b.l < lo) lo = b.l;
    if (b.h > hi) hi = b.h;
  }
  return { lo, hi };
}

await runBars({
  onBatch(state: BarsState, batch) {
    // Fold this batch's bar into history. A minute with no bar adds nothing.
    for (const bar of batch.bars) {
      if (bar.symbol === SYMBOL) pushBar(bar);
    }
    // Record what the last buy actually paid, from the fills this batch
    // reports (fills are priced at price_scale, so divide by 10^5).
    for (const fill of batch.fills) {
      if (fill.symbol === SYMBOL && fill.side === 'buy' && fill.status === 'filled') {
        entryPrice = Number(fill.price) / 100000;
      }
      if (fill.symbol === SYMBOL && fill.side === 'sell' && fill.status === 'filled') {
        entryPrice = null;
      }
    }
    if (state.warmingUp) return [];

    const held = state.positions.get(SYMBOL);
    const holding = held !== undefined && held.qty > 0n;
    const close = state.close(SYMBOL);
    if (close === null) return [];

    const closeNum = Number(close);
    const orders: (BuyInput | SellInput)[] = [];
    const r = range();

    if (holding) {
      // Exit: the close reached the top of the range, or the stop-loss tripped.
      const atTop = r !== null && closeNum > r.hi - SELL_ZONE * (r.hi - r.lo);
      const stopped = entryPrice !== null && closeNum < entryPrice * (1 - STOP_LOSS);
      if (atTop || stopped) {
        orders.push({ side: 'sell', symbol: SYMBOL, qty: held.qty, max_slippage_bps: MAX_SLIPPAGE_BPS });
        entryPrice = null;
      }
      return orders;
    }

    // Flat: only buy once the window is full, near its low, and not in a slide.
    if (r === null) return [];
    const span = r.hi - r.lo;
    if (span <= 0) return [];
    const nearLow = closeNum < r.lo + BUY_ZONE * span;
    if (!nearLow) return [];
    const oldest = history[0]!.c;
    if (oldest > 0 && closeNum / oldest - 1 < -TREND_GUARD) return [];
    // Only buy on a bar that closed up from the one before it: the low has
    // started to turn instead of still falling.
    const prev = history.length >= 2 ? history[history.length - 2]!.c : null;
    if (prev !== null && closeNum <= prev) return [];

    // Spend all the cash on hand, capped by the weight room the caps allow.
    const room = state.weightRoom(SYMBOL);
    let spend = state.cash < room ? state.cash : room;
    if (spend < BigInt(state.hello.fees.min_notional_quote_units)) return [];
    orders.push({ side: 'buy', symbol: SYMBOL, notional_quote_units: spend, max_slippage_bps: MAX_SLIPPAGE_BPS });
    return orders;
  },
});
