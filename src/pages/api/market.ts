export const prerender = false;
import type { APIRoute } from 'astro';

export const GET: APIRoute = async () => {
  const out: { quotes: any[]; crypto: Record<string, any> } = { quotes: [], crypto: {} };

  const CNBC_HDR = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
    'Referer': 'https://www.cnbc.com/',
    'Accept': 'application/json, */*',
  };

  // CNBC symbol → Yahoo Finance symbol (frontend reads Yahoo-style keys)
  const SYM_MAP: Record<string, string> = {
    '.SPX':  '^GSPC',
    '.VIX':  '^VIX',
    '.IXIC': '^IXIC',
    '@CL.1': 'CL=F',
    '@GC.1': 'GC=F',
    '.TWII': '^TWII',
    'TSM':   'TSM',
  };

  await Promise.allSettled([
    // ── Stocks + VIX + Oil + Gold via CNBC (no auth required) ──
    (async () => {
      const syms = Object.keys(SYM_MAP).join('|');
      try {
        const r = await fetch(
          `https://quote.cnbc.com/quote-html-webservice/quote.htm?symbols=${encodeURIComponent(syms)}&output=json`,
          { headers: CNBC_HDR, signal: AbortSignal.timeout(8000) }
        );
        if (!r.ok) return;
        const d = await r.json();
        let qs = d?.QuickQuoteResult?.QuickQuote ?? [];
        if (!Array.isArray(qs)) qs = [qs];
        for (const q of qs) {
          const mapped = SYM_MAP[q.symbol];
          if (mapped && q.last != null) {
            out.quotes.push({
              symbol: mapped,
              price: parseFloat(q.last),
              change: q.change_pct != null ? parseFloat(q.change_pct) : null,
            });
          }
        }
      } catch {}
    })(),

    // ── Crypto via CoinGecko (free, no key) ──
    fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,ripple&vs_currencies=usd&include_24hr_change=true',
      { signal: AbortSignal.timeout(8000) }
    )
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d) out.crypto = d; })
      .catch(() => {}),
  ]);

  return new Response(JSON.stringify(out), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
    },
  });
};
