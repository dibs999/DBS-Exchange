// Types and helpers for local Uniswap v3 simulation

export type PricePoint = { t: string; p: number };

export type Token = { symbol: string; name: string; decimals: number };
export type TickSim = { index: number; sqrtPrice: number; liquidityNet: number };
export type V3PoolSim = {
  id: string;
  token0: Token;
  token1: Token;
  fee: number;
  tickSpacing: number;
  sqrtPrice: number;
  tickCurrent: number;
  liquidity: number;
  ticks: TickSim[];
  volume24hUSD: number;
};

export type SwapEvent = {
  time: string;
  poolId: string;
  zeroForOne: boolean;
  amountIn: number;
  amountOut: number;
  priceAfter: number;
};

export type PositionLocal = {
  id: string;
  poolId: string;
  lowerTick: number;
  upperTick: number;
  liquidity: number;
  deposited0: number;
  deposited1: number;
  tokenId?: bigint;
};

export const TOKENS: Token[] = [
  { symbol: 'WETH', name: 'Wrapped Ether', decimals: 18 },
  { symbol: 'USDC', name: 'USD Coin', decimals: 6 },
  { symbol: 'WBTC', name: 'Wrapped Bitcoin', decimals: 8 },
];

export function t(sym: string): Token {
  const tok = TOKENS.find(x => x.symbol === sym);
  if (!tok) throw new Error('Unknown token ' + sym);
  return tok;
}

// Math helpers
const ONE_POINT_0001 = 1.0001;
const LN_1_0001 = Math.log(ONE_POINT_0001);

export function priceToTick(p: number) { return Math.floor(Math.log(p) / LN_1_0001); }
export function tickToPrice(tick: number) { return Math.pow(ONE_POINT_0001, tick); }
export function tickToSqrtPrice(tick: number) { return Math.sqrt(tickToPrice(tick)); }
export function priceToSqrtPrice(p: number) { return Math.sqrt(p); }
export function sqrtPriceToPrice(sp: number) { return sp * sp; }
export function roundToSpacing(tick: number, spacing: number) { return Math.floor(tick / spacing) * spacing; }

export function dxFromTo(L: number, sqrtA: number, sqrtB: number) { return L * (1 / sqrtA - 1 / sqrtB); }
export function dyFromTo(L: number, sqrtA: number, sqrtB: number) { return L * (sqrtB - sqrtA); }

export function nowStr() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatAmt(x: number, digits = 6) {
  if (!isFinite(x)) return '--';
  if (Math.abs(x) >= 1000) return x.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (Math.abs(x) >= 1) return x.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return x.toLocaleString(undefined, { maximumFractionDigits: digits });
}
export function formatUSD(x: number) {
  return `$${x.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

// Pool generator
export function makeV3Pool(
  id: string,
  token0: Token,
  token1: Token,
  midPrice: number,
  fee: number,
  tickSpacing: number,
  volume24hUSD: number
): V3PoolSim {
  const tick0 = roundToSpacing(priceToTick(midPrice), tickSpacing);
  const sqrt0 = tickToSqrtPrice(tick0);
  const baseL = 1_000_000;
  const ticks: TickSim[] = [];
  function addRange(lower: number, upper: number, L: number) {
    ticks.push({ index: lower, sqrtPrice: tickToSqrtPrice(lower), liquidityNet: +L });
    ticks.push({ index: upper, sqrtPrice: tickToSqrtPrice(upper), liquidityNet: -L });
  }
  addRange(tick0 - 600, tick0 + 600, baseL);
  addRange(tick0 - 300, tick0 + 300, baseL * 1.6);
  addRange(tick0 - 1200, tick0 + 1200, baseL * 0.6);
  ticks.sort((a, b) => a.index - b.index);

  let Lactive = 0;
  for (const tk of ticks) if (tk.index <= tick0) Lactive += tk.liquidityNet;
  return { id, token0, token1, fee, tickSpacing, sqrtPrice: sqrt0, tickCurrent: tick0, liquidity: Lactive, ticks, volume24hUSD };
}

// Swap simulation
export type SwapResult = { amountOut: number; newSqrt: number; newTick: number; newL: number };

export function simulateSwap(pool: V3PoolSim, amountIn: number, zeroForOne: boolean): SwapResult {
  let remainingIn = amountIn * (1 - pool.fee);
  let out = 0; let sqrtP = pool.sqrtPrice; let L = pool.liquidity; let tick = pool.tickCurrent;
  const ticksSorted = pool.ticks;
  function nextTickIndex(idx: number) { for (const t of ticksSorted) if (t.index > idx) return t.index; return idx + pool.tickSpacing * 1000; }
  function prevTickIndex(idx: number) { for (let i = ticksSorted.length - 1; i >= 0; i--) if (ticksSorted[i].index < idx) return ticksSorted[i].index; return idx - pool.tickSpacing * 1000; }
  function liquidityDeltaAt(ti: number) { let d = 0; for (const t of ticksSorted) if (t.index === ti) d += t.liquidityNet; return d; }

  let guard = 0;
  while (remainingIn > 0 && L > 0 && guard++ < 10_000) {
    if (zeroForOne) {
      const next = nextTickIndex(tick); const sqrtNext = tickToSqrtPrice(next); const dxToNext = dxFromTo(L, sqrtP, sqrtNext);
      if (remainingIn < dxToNext) { const invTarget = 1 / sqrtP - remainingIn / L; const newSqrt = 1 / invTarget; const dy = dyFromTo(L, sqrtP, newSqrt); out += dy; sqrtP = newSqrt; remainingIn = 0; break; }
      else { remainingIn -= dxToNext; const dy = dyFromTo(L, sqrtP, sqrtNext); out += dy; sqrtP = sqrtNext; tick = next; L += liquidityDeltaAt(tick); if (L <= 0) break; }
    } else {
      const prev = prevTickIndex(tick); const sqrtPrev = tickToSqrtPrice(prev); const dyToPrev = dyFromTo(L, sqrtPrev, sqrtP);
      if (remainingIn < dyToPrev) { const newSqrt = sqrtP - remainingIn / L; const dx = dxFromTo(L, newSqrt, sqrtP); out += dx; sqrtP = newSqrt; remainingIn = 0; break; }
      else { remainingIn -= dyToPrev; const dx = dxFromTo(L, sqrtPrev, sqrtP); out += dx; sqrtP = sqrtPrev; tick = prev; L -= liquidityDeltaAt(tick); if (L <= 0) break; }
    }
  }
  return { amountOut: out, newSqrt: sqrtP, newTick: tick, newL: L };
}

// Liquidity helpers
export function liquidityFromAmounts(sqrtP: number, sqrtA: number, sqrtB: number, amt0: number, amt1: number) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  if (sqrtP <= sqrtA) return amt0 / (1 / sqrtA - 1 / sqrtB);
  else if (sqrtP >= sqrtB) return amt1 / (sqrtB - sqrtA);
  else { const L0 = amt0 / (1 / sqrtP - 1 / sqrtB); const L1 = amt1 / (sqrtP - sqrtA); return Math.min(L0, L1); }
}
export function amountsFromLiquidity(sqrtP: number, sqrtA: number, sqrtB: number, L: number) {
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];
  if (sqrtP <= sqrtA) return { amt0: L * (1 / sqrtA - 1 / sqrtB), amt1: 0 };
  else if (sqrtP >= sqrtB) return { amt0: 0, amt1: L * (sqrtB - sqrtA) };
  else return { amt0: L * (1 / sqrtP - 1 / sqrtB), amt1: L * (sqrtP - sqrtA) };
}
