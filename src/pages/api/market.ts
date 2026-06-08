import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const out: { quotes: any[]; crypto: Record<string, any> } = { quotes: [], crypto: {} };

  await Promise.allSettled([
    // Stocks + VIX + Gold + XRP via Yahoo Finance
    fetch(
      'https://query1.finance.yahoo.com/v7/finance/quote?symbols=%5ETWII,%5EGSPC,%5EIXIC,%5EVIX,GC%3DF,XRP-USD',
      {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; twobears/1.0)' },
        signal: AbortSignal.timeout(6000),
      }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (!d) return;
        out.quotes = (d.quoteResponse?.result ?? []).map((s: any) => ({
          symbol: s.symbol,
          price: s.regularMarketPrice ?? null,
          change: s.regularMarketChangePercent ?? null,
        }));
      }),

    // BTC + ETH via CoinGecko
    fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(6000) }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) out.crypto = d; }),
  ]);

  return new Response(JSON.stringify(out), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
};
