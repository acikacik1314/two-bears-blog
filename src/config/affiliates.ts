// ─── Affiliates.One ───────────────────────────────────────────────────────────
// 支援深度連結：trackingUrl + '?t=' + encodeURIComponent(encodeURIComponent(targetUrl))
export const BOOKING_TRACKING   = 'https://abzcoupon.com/track/clicks/3455/c627c2bb980623dafa9cab248d2596412379128f78eee2f10276f6476a0449a8c23ae5a5112d'
export const AGODA_TRACKING     = 'https://afflnk.site/track/clicks/8682/c627c2bc9b0225dbff89ec23d62e994c21695b9633e0eef20f62a44125095ff88635aca3163d8e'
export const TRIP_TRACKING      = 'https://affclkr.online/track/clicks/3569/c627c2bb990529dffe9cab248d2596412379128f78eee3f20e76f6476a0449a8c23ae5a5112d'
export const KLOOK_TRACKING     = 'https://abzcoupon.com/track/clicks/3731/c627c2bb910426daf89cab248d2596412379128f78eee1f70676f6476a0449a8c23ae5a5112d'
export const KKDAY_TRACKING     = 'https://twcouponcenter.com/track/clicks/2652/c627c2ba900820d9f19cab248d2596412379128f78efe0f10576f6476a0449a8c23ae5a5112d'
export const SHOPEE_TRACKING    = 'https://tlcafftrax.com/track/clicks/5282/c627c2b7900723d7fb9cab248d2596412379128f78e8e4fc0576f6476a0449a8c23ae5a5112d'
export const YAHOO_TRACKING     = 'https://afftck.com/track/clicks/3416/c627c2bc9b0521dff088ec23d62e994c21695b9633e0e5f00666a44125095ff88635aca3163d8e'
export const RAKUTEN_TRACKING   = 'https://affclkr.com/track/clicks/9379/c627c2b8900224ddfe9cab248d2596412379128f78e4e5f30e76f6476a0449a8c23ae5a5112d'
export const S3_TRACKING        = 'https://abzcoupon.com/track/clicks/4281/c627c2bc9b0521dffc8cec23d62e994c21695b9633e0e2f60f61a44125095ff88635aca3163d8e'
export const UBEREATS_TRACKING  = 'https://abzcoupon.com/track/clicks/4127/c627c2bf980329d6ff8aec23d62e994c21695b9633e0e2f50567a44125095ff88635aca3163d8e'
export const TRIPADVISOR_TRACKING = 'https://tlcafftrax.com/track/clicks/2070/c627c2bb980727dcff9cab248d2596412379128f78efe6f30776f6476a0449a8c23ae5a5112d'
export const TRIVAGO_TRACKING   = 'https://affckr.site/track/clicks/1503/c627c2ba900821dff99cab248d2596412379128f78ece3f40476f6476a0449a8c23ae5a5112d'
export const TRAVELOCITY_TRACKING = 'https://affsrc.com/track/clicks/2451/c627c2b6980327d8fe9cab248d2596412379128f78efe2f10676f6476a0449a8c23ae5a5112d'
export const SETTOUR_TRACKING   = 'https://affclkr.com/track/clicks/4448/c627c2b6980327dbfe9cab248d2596412379128f78e9e2f00f76f6476a0449a8c23ae5a5112d'
export const COLATOUR_TRACKING  = 'https://affone.site/track/clicks/9601/c627c2bc9b0523ddfb88ec23d62e994c21695b9633e0eff20761a44125095ff88635aca3163d8e'
export const LIONTRAVEL_TRACKING = 'https://afftkr.site/track/clicks/7983/c627c2bc9b0523ddfb89ec23d62e994c21695b9633e0e1fd0f63a44125095ff88635aca3163d8e'
// 備用：Agoda 東南亞（不用於任何頁面，僅保存備查）
export const AGODA_FALLBACK     = 'https://affone.site/track/clicks/3408/c627c2ba900929dcfc9cab248d2596412379128f78eee2f40f76f6476a0449a8c23ae5a5112d'

// ─── iChannels ────────────────────────────────────────────────────────────────
// 短網址，只能落首頁，不支援深度連結參數
export const COUPANG_HOME   = 'https://whitehippo.net/3RDil'
export const CARREFOUR_HOME = 'https://greenmall.info/3RDio'
export const MOMO_HOME      = 'https://www1.gamepark.com.tw/3Ii4v'

// ─── Helper ───────────────────────────────────────────────────────────────────
export function deepLink(trackingUrl: string, targetUrl: string): string {
  return `${trackingUrl}?t=${encodeURIComponent(encodeURIComponent(targetUrl))}`
}
