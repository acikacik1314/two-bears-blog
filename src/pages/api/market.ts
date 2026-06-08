import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const out: { quotes: any[]; crypto: Record<string, any> } = { quotes: [], crypto: {} };

  const YF_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'Accept': 'application/json, */*',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://finance.yahoo.com/',
  };

  await Promise.allSettled([
    // Stocks + VIX via Yahoo Finance (try query2/v8 first, fall back to query1/v7)
    (async () => {
      const symbols = '%5ETWII,%5EGSPC,%5EVIX';
      let d: any = null;
      try {
        const r = await fetch(
          `https://query2.finance.yahoo.com/v8/finance/quote?symbols=${symbols}`,
          { headers: YF_HEADERS, signal: AbortSignal.timeout(7000) }
        );
        if (r.ok) d = await r.json();
      } catch {}
      if (!d) {
        try {
          const r = await fetch(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`,
            { headers: YF_HEADERS, signal: AbortSignal.timeout(7000) }
          );
          if (r.ok) d = await r.json();
        } catch {}
      }
      if (!d) return;
      const results = d.quoteResponse?.result ?? [];
      for (const s of results) {
        out.quotes.push({ symbol: s.symbol, price: s.regularMarketPrice ?? null, change: s.regularMarketChangePercent ?? null });
      }
    })(),

    // BTC + ETH + XRP via CoinGecko (free, no key)
    fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(8000) }
    )
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) out.crypto = d; }),

    // Gold via goldprice.org (free, no key needed)
    fetch('https://data-asg.goldprice.org/dbXRates/USD', { signal: AbortSignal.timeout(7000) })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const item = d?.items?.[0];
        if (item?.xauPrice) {
          out.quotes.push({ symbol: 'GC=F', price: item.xauPrice, change: item.pcXau ?? null });
        }
      })
      .catch(() => {}),
  ]);

  return new Response(JSON.stringify(out), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
};
