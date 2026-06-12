import React, { useState, useRef, useEffect } from 'react';

// ── Constants ──────────────────────────────────────────────────────────────────
const AGODA_TRACKING = 'https://abzcoupon.com/track/clicks/3408/c627c2ba900929dcfc9cab248d2596412379128f78eee2f40f76f6476a0449a8c23ae5a5112d';
const AGODA_CID = '1933603';
const BOOKING_AID = '304142';
const TRIP_TRACKING = 'https://afftck.site/track/clicks/3569/c627c2bb990529dffe9cab248d2596412379128f78eee3f20e76f6476a0449a8c23ae5a5112d';

const AGODA_CITY_IDS: Record<string, number> = {
  '東京': 5085, '大阪': 9590, '京都': 1784,
  '首爾': 14690, '曼谷': 9395, '新加坡': 4064,
  '台北': 4951, '沖繩': 1706, '福岡': 1714,
  '峇里島': 1271, '吉隆坡': 3573, '河口湖': 5085,
  '北海道': 662, '札幌': 662, '新宿': 5085, '澀谷': 5085,
};

interface TripCityData { cityId: number; provinceId?: number; type: 'CT' | 'LM' | 'P'; }
const TRIP_CITIES: Record<string, TripCityData> = {
  '東京':   { cityId: 228,   type: 'CT' },
  '大阪':   { cityId: 219,   provinceId: 11088, type: 'CT' },
  '京都':   { cityId: 734,   provinceId: 11087, type: 'CT' },
  '首爾':   { cityId: 274,   type: 'CT' },
  '曼谷':   { cityId: 359,   type: 'CT' },
  '新加坡': { cityId: 73,    type: 'CT' },
  '台北':   { cityId: 617,   provinceId: 53,    type: 'CT' },
  '河口湖': { cityId: 50160, provinceId: 11082, type: 'LM' },
  '沖繩':   { cityId: -1,    provinceId: 11059, type: 'P'  },
  '北海道': { cityId: -1,    provinceId: 11055, type: 'P'  },
  '札幌':   { cityId: -1,    provinceId: 11055, type: 'P'  },
  '峇里島': { cityId: 723,   provinceId: 11445, type: 'CT' },
  '巴黎':   { cityId: 192,   provinceId: 10107, type: 'CT' },
  '倫敦':   { cityId: 338,   provinceId: 10092, type: 'CT' },
  '紐約':   { cityId: 633,   provinceId: 10204, type: 'CT' },
  '洛杉磯': { cityId: 347,   provinceId: 10125, type: 'CT' },
  '杜拜':   { cityId: 220,   provinceId: 10965, type: 'CT' },
  '吉隆坡': { cityId: 315,   type: 'CT' },
};

interface BudgetRange { agoda_min: number; agoda_max: number; booking_min: number; booking_max: number; }
const BUDGET_MAP: Record<string, BudgetRange> = {
  '1k-3k': { agoda_min: 1000, agoda_max: 3000,  booking_min: 33,  booking_max: 99  },
  '3k-5k': { agoda_min: 3000, agoda_max: 5000,  booking_min: 99,  booking_max: 165 },
  '5k+':   { agoda_min: 5000, agoda_max: 99999, booking_min: 165, booking_max: 9999 },
};

type Intent = 'all' | 'luxury' | 'escape' | 'base';

interface IntentFilters {
  agodaExtra: string; agodaSort: string;
  bookingNflt: string;
  tripListFilters: string;
  label: string; desc: string;
}
const INTENT_FILTERS: Record<Intent, IntentFilters> = {
  all:    { agodaExtra: '', agodaSort: 'popularity', bookingNflt: 'review_score=80', tripListFilters: '29~1*29*1~2*2,80~2~1*80*2', label: '🗺 全部', desc: '高評分優先' },
  luxury: { agodaExtra: '&hotelStarRating=5&hotelReviewScore=9&roomAmenities=31&hotelFacility=91&groupedBedTypes=1,5', agodaSort: 'price_desc', bookingNflt: 'class=5;review_score=90;hotelfacility=433;roomfacility=5', tripListFilters: '29~1*29*1~1*1,17~1*17*1,77~91*77*91,80~2~1*80*2', label: '✨ 奢華', desc: '5星・評分9+・SPA・特大床' },
  escape: { agodaExtra: '&hotelReviewScore=9&roomAmenities=31&hotelFacility=91', agodaSort: 'rating_desc', bookingNflt: 'review_score=90;hotelfacility=433', tripListFilters: '29~1*29*1~1*1,77~91*77*91,3~664*3*664,80~2~1*80*2', label: '🌿 避世', desc: '評分9+・SPA・公共澡堂' },
  base:   { agodaExtra: '&hotelReviewScore=8&roomAmenities=31,42', agodaSort: 'price_asc', bookingNflt: 'review_score=80;roomfacility=999', tripListFilters: '29~1*29*1~2*2,17~2*17*2,6~9*6*9,80~2~1*80*2', label: '🏡 長住', desc: '評分8+・廚房・4星' },
};

// ── Types ──────────────────────────────────────────────────────────────────────
interface SearchParams {
  destination: string; checkIn: string; checkOut: string;
  stars: number[]; budget: string; adults: string; rooms: string; hotelName: string;
  intent: Intent;
}
interface SearchLinks {
  agoda: string; booking: string; trip: string;
  destination: string; checkIn: string; checkOut: string; adults: number; rooms: number;
}
interface Discount { id: string; name: string; type: 'credit-card' | 'loyalty'; discount: number; validFor: string[]; description: string; }
interface FlashDeal { city: string; flag: string; discount: number; price: number; }
interface AISuggestion { area: string; emoji: string; tag: string; pros: string[]; cons: string[]; price: string; searchQuery: string; }
interface Message { id: string; role: 'user' | 'assistant'; content: string; suggestions?: AISuggestion[]; }
interface MapCity { name: string; flag: string; x: number; y: number; price: number; trend: 'up' | 'down' | 'stable'; trendPct: number; }

// ── Static Data ────────────────────────────────────────────────────────────────
const FLASH_DEALS: FlashDeal[] = [
  { city: '沖繩', flag: '🇯🇵', discount: 31, price: 2100 },
  { city: '東京', flag: '🇯🇵', discount: 23, price: 2900 },
  { city: '大阪', flag: '🇯🇵', discount: 18, price: 1800 },
  { city: '首爾', flag: '🇰🇷', discount: 27, price: 1500 },
  { city: '曼谷', flag: '🇹🇭', discount: 35, price: 900  },
  { city: '峇里島', flag: '🇮🇩', discount: 22, price: 1200 },
  { city: '新加坡', flag: '🇸🇬', discount: 15, price: 4200 },
  { city: '巴黎',  flag: '🇫🇷', discount: 12, price: 5800 },
];

const DISCOUNTS: Discount[] = [
  { id: 'cathay-cube', name: '國泰世華 CUBE卡',  type: 'credit-card', discount: 5,  validFor: ['Agoda', 'Booking.com', '飯店官網', 'Trip.com'], description: '旅遊類消費95折，無上限' },
  { id: 'fubon-j',    name: '富邦 J卡',          type: 'credit-card', discount: 8,  validFor: ['Agoda', '飯店官網', 'Trip.com'],                  description: '訂房平台回饋8%，上限NT$300' },
  { id: 'esun-travel',name: '玉山旅遊卡',        type: 'credit-card', discount: 3,  validFor: ['Agoda', 'Booking.com', '飯店官網', 'Hotels.com'], description: '海外旅遊消費3%回饋' },
  { id: 'ubot-visa',  name: '聯邦 賺很大Ⅱ',     type: 'credit-card', discount: 6,  validFor: ['Booking.com', 'Expedia'],                         description: '國際訂房平台6%無上限' },
  { id: 'hilton',     name: 'Hilton 住三送一',   type: 'loyalty',     discount: 25, validFor: ['飯店官網'],                                       description: '連續住3晚第4晚免費（Hilton成員）' },
  { id: 'ihg',        name: 'IHG 第四晚免費',    type: 'loyalty',     discount: 25, validFor: ['飯店官網'],                                       description: '連續住4晚第4晚免費（IHG One成員）' },
  { id: 'marriott',   name: 'Marriott Bonvoy積分',type: 'loyalty',    discount: 15, validFor: ['飯店官網'],                                       description: '積分換免費房，等值約85折' },
];

const MAP_CITIES: MapCity[] = [
  { name: '東京',   flag: '🇯🇵', x: 78, y: 30, price: 2900, trend: 'down',   trendPct: 23 },
  { name: '大阪',   flag: '🇯🇵', x: 76, y: 36, price: 1800, trend: 'down',   trendPct: 18 },
  { name: '首爾',   flag: '🇰🇷', x: 74, y: 28, price: 1500, trend: 'down',   trendPct: 27 },
  { name: '北京',   flag: '🇨🇳', x: 70, y: 28, price: 1200, trend: 'stable', trendPct: 2  },
  { name: '曼谷',   flag: '🇹🇭', x: 68, y: 45, price: 900,  trend: 'down',   trendPct: 35 },
  { name: '新加坡', flag: '🇸🇬', x: 70, y: 52, price: 4200, trend: 'up',     trendPct: 8  },
  { name: '峇里島', flag: '🇮🇩', x: 73, y: 57, price: 1200, trend: 'down',   trendPct: 22 },
  { name: '巴黎',   flag: '🇫🇷', x: 47, y: 22, price: 5800, trend: 'down',   trendPct: 12 },
  { name: '倫敦',   flag: '🇬🇧', x: 45, y: 19, price: 6200, trend: 'stable', trendPct: 3  },
  { name: '紐約',   flag: '🇺🇸', x: 22, y: 26, price: 7800, trend: 'up',     trendPct: 5  },
  { name: '洛杉磯', flag: '🇺🇸', x: 13, y: 33, price: 5500, trend: 'down',   trendPct: 10 },
  { name: '杜拜',   flag: '🇦🇪', x: 58, y: 38, price: 3800, trend: 'down',   trendPct: 15 },
];

// ── URL Builders ───────────────────────────────────────────────────────────────
function offsetDate(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function parseAdultsStr(val: string): number {
  if (val === '家庭（含小孩）') return 2;
  const n = parseInt(val);
  return isNaN(n) ? 2 : n;
}

function buildAgodaUrl(
  destination: string, checkIn: string, checkOut: string,
  adults: number, rooms: number, intent: Intent, hotelName?: string
): string {
  const cityId = AGODA_CITY_IDS[destination.trim()];
  const inf = INTENT_FILTERS[intent];
  const base = [
    'locale=zh-tw', 'currency=TWD',
    `checkIn=${checkIn}`, `checkOut=${checkOut}`,
    `rooms=${rooms}`, `adults=${adults}`,
    `sort=${inf.agodaSort}`,
    `cid=${AGODA_CID}`, 'productType=-1',
  ];
  if (cityId) {
    base.push(`city=${cityId}`);
    if (hotelName) base.push(`textToSearch=${encodeURIComponent(hotelName)}`);
  } else {
    base.push(`textToSearch=${encodeURIComponent(hotelName || destination)}`);
  }
  const agodaUrl = `https://www.agoda.com/zh-tw/search?${base.join('&')}${inf.agodaExtra}`;
  return `${AGODA_TRACKING}?t=${encodeURIComponent(encodeURIComponent(agodaUrl))}`;
}

function buildBookingUrl(
  destination: string, checkIn: string, checkOut: string,
  adults: number, rooms: number, intent: Intent
): string {
  const nflt = INTENT_FILTERS[intent].bookingNflt
    .split(';').map(f => encodeURIComponent(f)).join('%3B');
  return `https://www.booking.com/searchresults.zh-tw.html` +
    `?aid=${BOOKING_AID}` +
    `&ss=${encodeURIComponent(destination)}` +
    `&checkin=${checkIn}&checkout=${checkOut}` +
    `&group_adults=${adults}&no_rooms=${rooms}` +
    `&lang=zh-tw&nflt=${nflt}`;
}

function buildTripUrl(
  destination: string, checkIn: string, checkOut: string,
  adults: number, rooms: number, intent: Intent
): string {
  const cityData = TRIP_CITIES[destination.trim()];
  const listFilters = encodeURIComponent(INTENT_FILTERS[intent].tripListFilters);
  const params: string[] = [
    'curr=TWD', 'locale=zh-TW',
    `checkin=${checkIn}`, `checkout=${checkOut}`,
    `adult=${adults}`, `rooms=${rooms}`,
    `listFilters=${listFilters}`,
  ];
  if (cityData) {
    if (cityData.type === 'P' && cityData.provinceId) {
      params.push(`province=${cityData.provinceId}`);
    } else {
      params.push(`city=${cityData.cityId}`);
    }
  } else {
    params.push(`keyword=${encodeURIComponent(destination)}`);
  }
  const tripUrl = `https://www.trip.com/hotels/list/?${params.join('&')}`;
  return `${TRIP_TRACKING}?t=${encodeURIComponent(encodeURIComponent(tripUrl))}`;
}

// ── AI Response ────────────────────────────────────────────────────────────────
function buildAIResponse(query: string): Message {
  const isSeoul   = /首爾|韓國|明洞|弘大|江南/.test(query);
  const isOsaka   = /大阪|關西|道頓堀|心齋橋/.test(query);
  const isBangkok = /曼谷|泰國|素坤逸|暹羅/.test(query);
  const isBali    = /峇里島|峇里|烏布|庫塔/.test(query);

  let suggestions: AISuggestion[];
  if (isSeoul) {
    suggestions = [
      { area: '明洞（首爾市中心）', emoji: '🏆', tag: 'CP值最高', searchQuery: '明洞',
        pros: ['地鐵4號線直達', '購物美食一條街', '均價NT$1,200–1,800'],
        cons: ['觀光客密集', '週末人潮擁擠'], price: 'NT$1,200 起/晚' },
      { area: '弘大（홍대）', emoji: '🎵', tag: '年輕潮流', searchQuery: '弘大',
        pros: ['夜店酒吧雲集', '獨立設計品牌', '2號線樞紐'],
        cons: ['深夜噪音較大', '距景福宮需轉乘'], price: 'NT$1,000 起/晚' },
      { area: '江南（강남）', emoji: '💎', tag: '商務首選', searchQuery: '江南',
        pros: ['高端酒店雲集', 'COEX購物中心', '地鐵便利'],
        cons: ['均價較高NT$2,500+', '觀光景點較少'], price: 'NT$2,000 起/晚' },
    ];
  } else if (isOsaka) {
    suggestions = [
      { area: '道頓堀・心齋橋', emoji: '🏆', tag: 'CP值最高', searchQuery: '道頓堀',
        pros: ['美食購物核心區', '難波站步行可達', '夜晚超熱鬧'],
        cons: ['週末人潮爆滿', '深夜噪音'], price: 'NT$1,200 起/晚' },
      { area: '梅田・大阪站', emoji: '🏙️', tag: '交通最強', searchQuery: '梅田',
        pros: ['大阪車站直連', '往京都最快速', '商務設施完善'],
        cons: ['均價NT$1,800+', '觀光氛圍較淡'], price: 'NT$1,500 起/晚' },
      { area: '新世界・天王寺', emoji: '💡', tag: '最省荷包', searchQuery: '新世界',
        pros: ['通天閣散步圈', '最便宜住宿區', '在地庶民美食'],
        cons: ['距心齋橋需20分', '街道較舊式'], price: 'NT$800 起/晚' },
    ];
  } else if (isBangkok) {
    suggestions = [
      { area: '素坤蔚（BTS沿線）', emoji: '🏆', tag: 'CP值最高', searchQuery: '素坤逸',
        pros: ['BTS空鐵便利', '購物中心林立', '均價NT$800–1,500'],
        cons: ['塞車嚴重', '範圍較廣'], price: 'NT$800 起/晚' },
      { area: '暹羅・奇隆', emoji: '🛍️', tag: '購物天堂', searchQuery: '暹羅',
        pros: ['暹羅廣場步行', 'BTS交匯站', '美食選擇多元'],
        cons: ['均價NT$2,000+', '觀光客集中'], price: 'NT$1,500 起/晚' },
      { area: '考山路周邊', emoji: '🎒', tag: '背包客天堂', searchQuery: '考山路',
        pros: ['最便宜NT$400起', '大皇宮步行', '背包客交流'],
        cons: ['環境較嘈雜', '設施較基本'], price: 'NT$400 起/晚' },
    ];
  } else if (isBali) {
    suggestions = [
      { area: '庫塔・雷根（海灘區）', emoji: '🏖️', tag: 'CP值最高', searchQuery: '庫塔',
        pros: ['印度洋海灘直達', '均價NT$800–1,500', '衝浪勝地'],
        cons: ['人潮多', '推銷較煩'], price: 'NT$800 起/晚' },
      { area: '烏布（藝術文化區）', emoji: '🌿', tag: '最有特色', searchQuery: '烏布',
        pros: ['梯田美景環繞', 'SPA超便宜', '瑜伽養生勝地'],
        cons: ['距海灘2小時', '需租機車代步'], price: 'NT$600 起/晚' },
      { area: '水明漾・坎古', emoji: '🤙', tag: '網美打卡區', searchQuery: '水明漾',
        pros: ['網美咖啡廳密集', '數位遊牧聚集', '均價NT$700–1,200'],
        cons: ['塞車嚴重', '距機場1小時'], price: 'NT$700 起/晚' },
    ];
  } else {
    suggestions = [
      { area: '上野・淺草（東東京文化圈）', emoji: '🏆', tag: 'CP值最高', searchQuery: '上野',
        pros: ['均價NT$1,800–2,500', '文化景點密集', '成田機場直達'],
        cons: ['距新宿購物區需30分', '夜生活較少'], price: 'NT$1,800 起/晚' },
      { area: '新宿（東京都心）', emoji: '🏙️', tag: '生活機能絕佳', searchQuery: '新宿',
        pros: ['JR與地鐵樞紐', '百貨商場林立', '深夜食堂豐富'],
        cons: ['均價NT$2,800+', '人潮擁擠'], price: 'NT$2,200 起/晚' },
      { area: '秋葉原・神田', emoji: '💡', tag: '最省交通費', searchQuery: '秋葉原',
        pros: ['電器美食雙享受', '東西向移動方便', '小型商旅性價比高'],
        cons: ['觀光景點需轉乘', '住宿選項較少'], price: 'NT$1,600 起/晚' },
    ];
  }
  return {
    id: String(Date.now()), role: 'assistant',
    content: `🐻 分析完成！根據「${query}」精選 3 個方案：\n點選卡片即可直接跳轉比價 👇`,
    suggestions,
  };
}

// ── Icons ──────────────────────────────────────────────────────────────────────
const IconSearch = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
  </svg>
);
const IconChevronDown = ({ open }: { open: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
    style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}>
    <polyline points="6 9 12 15 18 9"/>
  </svg>
);
const IconSend = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
  </svg>
);
const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
  </svg>
);
const IconMap = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
  </svg>
);
const IconSparkles = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5L12 2z"/>
  </svg>
);
const IconTrendingDown = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/>
  </svg>
);
const IconCard = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/>
  </svg>
);
const IconCheck = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);
const IconStar = ({ filled }: { filled?: boolean }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? '#F59E0B' : 'none'} stroke="#F59E0B" strokeWidth="2">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
  </svg>
);
const IconExternalLink = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);

// ── Main Component ─────────────────────────────────────────────────────────────
export default function HotelFinder() {
  const [search, setSearch] = useState<SearchParams>({
    destination: '', checkIn: '', checkOut: '',
    stars: [], budget: '', adults: '2', rooms: '1', hotelName: '', intent: 'all',
  });
  const [searched, setSearched]   = useState(false);
  const [loading, setLoading]     = useState(false);
  const [searchLinks, setSearchLinks] = useState<SearchLinks | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const [mapMode, setMapMode]           = useState(false);
  const [hoveredCity, setHoveredCity]   = useState<string | null>(null);
  const [carouselOffset, setCarouselOffset] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setCarouselOffset(o => (o + 1) % FLASH_DEALS.length), 3000);
    return () => clearInterval(t);
  }, []);

  const [walletOpen, setWalletOpen]       = useState(false);
  const [selectedCards, setSelectedCards] = useState<string[]>([]);

  const [chatOpen, setChatOpen]   = useState(false);
  const [messages, setMessages]   = useState<Message[]>([{
    id: '0', role: 'assistant',
    content: '你好！我是 🐻 兩隻熊AI省錢小助手。\n\n告訴我你的旅遊計畫，我來幫你找最划算的住宿！\n\n試試輸入：「東京五天四夜，兩人，預算兩萬」',
  }]);
  const [chatInput, setChatInput] = useState('');
  const [typing, setTyping]       = useState(false);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, typing]);

  // ── Core search action ──
  function doSearch(dest: string, ci: string, co: string, adults: number, rooms: number, intent: Intent, hotelName?: string) {
    const agoda   = buildAgodaUrl(dest, ci, co, adults, rooms, intent, hotelName);
    const booking = buildBookingUrl(dest, ci, co, adults, rooms, intent);
    const trip    = buildTripUrl(dest, ci, co, adults, rooms, intent);
    window.open(agoda, '_blank', 'noopener');
    setTimeout(() => window.open(booking, '_blank', 'noopener'), 400);
    setTimeout(() => window.open(trip,    '_blank', 'noopener'), 800);
    setSearchLinks({ agoda, booking, trip, destination: dest, checkIn: ci, checkOut: co, adults, rooms });
  }

  function handleSearch() {
    if (!search.destination.trim()) return;
    setLoading(true);
    const ci = search.checkIn  || offsetDate(7);
    const co = search.checkOut || offsetDate(10);
    const adults = parseAdultsStr(search.adults);
    const rooms  = parseInt(search.rooms) || 1;
    setTimeout(() => {
      doSearch(search.destination, ci, co, adults, rooms, search.intent, search.hotelName || undefined);
      setSearched(true);
      setLoading(false);
      setMapMode(false);
      setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }, 500);
  }

  function pickCity(city: string) {
    doSearch(city, offsetDate(1), offsetDate(4), 2, 1, search.intent);
    setSearch(s => ({ ...s, destination: city }));
    setSearched(true);
    setMapMode(false);
    setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  function sendChat() {
    if (!chatInput.trim()) return;
    const q = chatInput.trim();
    setChatInput('');
    setMessages(m => [...m, { id: String(Date.now()), role: 'user', content: q }]);
    setTyping(true);
    setTimeout(() => { setTyping(false); setMessages(m => [...m, buildAIResponse(q)]); }, 1400);
  }

  function toggleCard(id: string) {
    setSelectedCards(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  function openDarkSearch() {
    const target = search.hotelName || search.destination || '飯店';
    const q = encodeURIComponent(`"${target}" (優惠碼 OR 閃購 OR LINE限定 OR 住宿券 OR 私密價 OR 社群優惠)`);
    window.open(`https://www.google.com/search?q=${q}`, '_blank');
  }

  const displayedDeals = Array.from({ length: 6 }, (_, i) => FLASH_DEALS[(carouselOffset + i) % FLASH_DEALS.length]);

  const cardTips = selectedCards.flatMap(id => {
    const d = DISCOUNTS.find(x => x.id === id);
    return d ? [{ name: d.name, tip: `刷 ${d.validFor.slice(0, 2).join('/')} 省${d.discount}%` }] : [];
  });

  // ── Render ──
  return (
    <div className="min-h-screen bg-slate-50 font-sans">

      {/* HEADER */}
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl shrink-0">🐻</span>
            <div className="min-w-0">
              <div className="font-black text-base sm:text-lg text-[#8B5A2B] leading-tight truncate">兩隻熊超省飯店搜尋器</div>
              <div className="text-xs text-gray-400 hidden sm:block">Agoda + Booking + Trip 三平台同步 · 含稅含APP · 鐵血真便宜</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setMapMode(m => !m)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                mapMode ? 'bg-[#8B5A2B] text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              <IconMap /><span className="hidden sm:inline ml-1">{mapMode ? '列表模式' : '切換地圖'}</span>
              <span className="sm:hidden">🗺️</span>
            </button>
            <button onClick={() => setChatOpen(c => !c)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-full text-xs sm:text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 transition-all">
              <IconSparkles /><span className="hidden sm:inline ml-1">AI助手</span><span className="sm:hidden">AI</span>
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* 1. FLASH DEALS */}
        <div className="bg-gradient-to-r from-[#8B5A2B] to-amber-600 rounded-2xl p-4 overflow-hidden">
          <div className="flex items-center gap-2 mb-3">
            <IconTrendingDown />
            <span className="text-white font-bold text-sm">今日閃崩價</span>
            <span className="ml-auto text-white/60 text-xs hidden sm:block">點擊直接開啟 Agoda + Booking 比價</span>
          </div>
          <div className="flex gap-2.5 overflow-hidden">
            {displayedDeals.map((deal, i) => (
              <button key={`${deal.city}-${i}`} onClick={() => pickCity(deal.city)}
                className="flex-shrink-0 bg-white/10 hover:bg-white/25 backdrop-blur rounded-xl px-3.5 py-2.5 text-left transition-all border border-white/15 hover:border-white/40">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-base">{deal.flag}</span>
                  <span className="text-white font-bold text-sm">{deal.city}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="bg-red-500 text-white text-xs font-black px-1.5 py-0.5 rounded-full">↓{deal.discount}%</span>
                  <span className="text-white/80 text-xs">NT${deal.price.toLocaleString()}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 2. SEARCH CONSOLE */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6">
          <h2 className="text-base font-black text-gray-950 mb-4 flex items-center gap-2">
            <IconSearch /> Agoda + Booking + Trip 三平台同步比價
          </h2>

          {/* Intent buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
            {(Object.entries(INTENT_FILTERS) as [Intent, IntentFilters][]).map(([key, val]) => (
              <button key={key}
                onClick={() => setSearch(s => ({ ...s, intent: key }))}
                className={`p-3 rounded-xl border text-left transition-all ${
                  search.intent === key
                    ? 'border-[#8B5A2B] bg-[#8B5A2B]/8 shadow-sm'
                    : 'border-gray-200 bg-gray-50 hover:border-[#8B5A2B]/40'}`}>
                <div className="font-bold text-sm text-gray-900">{val.label}</div>
                <div className="text-xs text-gray-400 mt-0.5 leading-snug">{val.desc}</div>
              </button>
            ))}
          </div>

          {search.intent !== 'all' && (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
              <span className="font-bold">{INTENT_FILTERS[search.intent].label}</span>
              <span className="text-amber-600">· {INTENT_FILTERS[search.intent].desc}</span>
              <button onClick={() => setSearch(s => ({ ...s, intent: 'all' }))} className="ml-auto text-amber-500 hover:text-amber-700">✕</button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">目的地</label>
              <input type="text" value={search.destination}
                onChange={e => setSearch(s => ({ ...s, destination: e.target.value }))}
                onKeyDown={e => e.key === 'Enter' && handleSearch()}
                placeholder="東京、大阪、首爾..."
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">入住</label>
              <input type="date" value={search.checkIn}
                onChange={e => setSearch(s => ({ ...s, checkIn: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/10 transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">退房</label>
              <input type="date" value={search.checkOut}
                onChange={e => setSearch(s => ({ ...s, checkOut: e.target.value }))}
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/10 transition-all"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">大人</label>
                <select value={search.adults} onChange={e => setSearch(s => ({ ...s, adults: e.target.value }))}
                  className="w-full px-2 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-[#8B5A2B] bg-white transition-all">
                  {['1','2','3','4'].map(n => <option key={n} value={n}>{n}人</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">房間</label>
                <select value={search.rooms} onChange={e => setSearch(s => ({ ...s, rooms: e.target.value }))}
                  className="w-full px-2 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 focus:outline-none focus:border-[#8B5A2B] bg-white transition-all">
                  {['1','2'].map(n => <option key={n} value={n}>{n}間</option>)}
                </select>
              </div>
            </div>
          </div>

          <div className="mb-5">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 uppercase tracking-wide">飯店名稱（選填，用於 Agoda 精確搜尋）</label>
            <input type="text" value={search.hotelName}
              onChange={e => setSearch(s => ({ ...s, hotelName: e.target.value }))}
              placeholder="輸入特定飯店名稱..."
              className="w-full px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/10 transition-all"
            />
          </div>

          <button onClick={handleSearch} disabled={loading || !search.destination.trim()}
            className="w-full py-3.5 bg-gradient-to-r from-[#8B5A2B] to-amber-600 text-white font-black text-base rounded-xl hover:opacity-95 hover:shadow-lg hover:shadow-amber-200/60 transition-all flex items-center justify-center gap-2 active:scale-[.99] disabled:opacity-50 disabled:cursor-not-allowed">
            {loading
              ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />準備中...</>
              : <><IconSearch />同步開啟 Agoda + Booking + Trip 三平台比價</>}
          </button>
        </div>

        {/* 3. WALLET */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <button onClick={() => setWalletOpen(w => !w)}
            className="w-full flex items-center justify-between px-5 sm:px-6 py-4 hover:bg-gray-50/50 transition-colors">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-[#8B5A2B]/10 rounded-xl flex items-center justify-center shrink-0">
                <IconCard />
              </div>
              <div className="text-left">
                <div className="font-bold text-gray-950 text-sm">💳 我的錢包 — 刷哪張最省</div>
                <div className="text-xs text-gray-400">勾選你的信用卡，搜尋後自動提示最省刷法</div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedCards.length > 0 && (
                <span className="bg-green-100 text-green-700 text-xs font-bold px-2.5 py-1 rounded-full">已選 {selectedCards.length} 張</span>
              )}
              <IconChevronDown open={walletOpen} />
            </div>
          </button>
          {walletOpen && (
            <div className="px-5 sm:px-6 pb-5 border-t border-gray-50">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-4">
                {DISCOUNTS.map(d => {
                  const on = selectedCards.includes(d.id);
                  return (
                    <button key={d.id} onClick={() => toggleCard(d.id)}
                      className={`p-3.5 rounded-xl border text-left transition-all ${on ? 'border-[#8B5A2B] bg-[#8B5A2B]/5 shadow-sm' : 'border-gray-100 bg-gray-50 hover:border-gray-300'}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="text-sm">{d.type === 'credit-card' ? '💳' : '🏨'}</span>
                            <div className="font-bold text-gray-950 text-xs truncate">{d.name}</div>
                          </div>
                          <div className="text-gray-500 text-xs leading-snug">{d.description}</div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {d.validFor.map(v => <span key={v} className="bg-blue-50 text-blue-600 text-xs px-1.5 py-0.5 rounded-md">{v}</span>)}
                          </div>
                        </div>
                        <span className={`font-black text-sm shrink-0 ${d.type === 'credit-card' ? 'text-[#8B5A2B]' : 'text-purple-600'}`}>-{d.discount}%</span>
                      </div>
                      {on && <div className="flex items-center gap-1 mt-2.5 text-[#8B5A2B]"><IconCheck /><span className="text-xs font-semibold">已選用</span></div>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* 4. MAP or RESULTS */}
        {mapMode ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-5 sm:px-6 py-4 border-b border-gray-50 flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="font-black text-gray-950">🗺️ 全球飯店價格地圖</div>
                <div className="text-xs text-gray-400 mt-0.5">點擊城市直接跳轉 Agoda + Booking 比價</div>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-400 inline-block" />降價</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />漲價</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />持平</span>
              </div>
            </div>
            <div className="relative overflow-hidden bg-gradient-to-b from-sky-50 via-blue-50 to-sky-100" style={{ height: 420 }}>
              <div className="absolute inset-0 opacity-[0.07]"
                style={{ backgroundImage: 'linear-gradient(#8B5A2B 1px,transparent 1px),linear-gradient(90deg,#8B5A2B 1px,transparent 1px)', backgroundSize: '42px 42px' }} />
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 70" preserveAspectRatio="none">
                <ellipse cx="20" cy="30" rx="11" ry="13" fill="#CBD5E1" opacity="0.35" />
                <ellipse cx="27" cy="52" rx="6"  ry="9"  fill="#CBD5E1" opacity="0.35" />
                <ellipse cx="47" cy="23" rx="7"  ry="8"  fill="#CBD5E1" opacity="0.35" />
                <ellipse cx="50" cy="44" rx="5.5" ry="9" fill="#CBD5E1" opacity="0.35" />
                <ellipse cx="68" cy="30" rx="14" ry="11" fill="#CBD5E1" opacity="0.35" />
                <ellipse cx="76" cy="57" rx="5"  ry="4"  fill="#CBD5E1" opacity="0.35" />
              </svg>
              {MAP_CITIES.map(city => {
                const isHovered = hoveredCity === city.name;
                const dotCls = city.trend === 'down' ? 'bg-green-500' : city.trend === 'up' ? 'bg-red-400' : 'bg-gray-400';
                return (
                  <div key={city.name} className="absolute cursor-pointer"
                    style={{ left: `${city.x}%`, top: `${city.y}%`, transform: 'translate(-50%,-50%)' }}
                    onMouseEnter={() => setHoveredCity(city.name)}
                    onMouseLeave={() => setHoveredCity(null)}
                    onClick={() => { pickCity(city.name); setMapMode(false); }}>
                    {isHovered && <span className="absolute inset-0 rounded-full animate-ping bg-green-400/40" style={{ width: 24, height: 24, margin: -6 }} />}
                    <div className={`w-3 h-3 rounded-full border-2 border-white shadow-md transition-transform duration-200 ${dotCls} ${isHovered ? 'scale-150' : ''}`} />
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 text-gray-700 font-bold text-[10px] whitespace-nowrap bg-white/85 backdrop-blur px-1.5 py-0.5 rounded-md shadow-sm pointer-events-none">
                      {city.name}
                    </div>
                    {isHovered && (
                      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white rounded-xl px-3 py-2.5 text-xs whitespace-nowrap shadow-2xl z-20 pointer-events-none">
                        <div className="font-bold mb-0.5">{city.flag} {city.name}</div>
                        <div className="text-amber-400 font-black text-base">NT${city.price.toLocaleString()}</div>
                        <div className={`text-xs font-semibold ${city.trend === 'down' ? 'text-green-400' : city.trend === 'up' ? 'text-red-400' : 'text-gray-400'}`}>
                          {city.trend === 'down' ? `↓${city.trendPct}%` : city.trend === 'up' ? `↑${city.trendPct}%` : '→ 持平'}
                        </div>
                        <div className="text-gray-400 text-xs mt-0.5">點擊開啟比價</div>
                        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-[5px] border-r-[5px] border-t-[5px] border-transparent border-t-gray-900" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="px-5 sm:px-6 py-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2">
              {MAP_CITIES.map(city => (
                <button key={city.name} onClick={() => { pickCity(city.name); setMapMode(false); }}
                  className="text-center p-2.5 rounded-xl hover:bg-gray-50 transition-all border border-transparent hover:border-gray-100">
                  <div className="text-lg">{city.flag}</div>
                  <div className="text-xs font-bold text-gray-700 mt-0.5">{city.name}</div>
                  <div className="text-sm font-black text-[#8B5A2B]">NT${city.price.toLocaleString()}</div>
                  <div className={`text-xs font-semibold ${city.trend === 'down' ? 'text-green-600' : city.trend === 'up' ? 'text-red-500' : 'text-gray-400'}`}>
                    {city.trend === 'down' ? `↓${city.trendPct}%` : city.trend === 'up' ? `↑${city.trendPct}%` : '→'}
                  </div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4" ref={resultsRef}>
            {!searched && !loading && (
              <div className="text-center py-16 text-gray-400">
                <div className="text-6xl mb-4 opacity-25">🐻</div>
                <p className="text-lg font-bold text-gray-500">輸入目的地，同步開啟 Agoda + Booking + Trip 三平台比價</p>
                <p className="text-sm mt-1">或點擊上方閃崩城市快速跳轉</p>
              </div>
            )}

            {loading && (
              <div className="text-center py-16">
                <div className="text-5xl mb-4 animate-bounce">🐻</div>
                <p className="text-base font-bold text-[#8B5A2B]">正在準備跳轉至 Agoda + Booking...</p>
                <div className="flex justify-center gap-1.5 mt-4">
                  {[0,1,2].map(i => <span key={i} className="w-2 h-2 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: `${i*150}ms` }} />)}
                </div>
              </div>
            )}

            {searched && searchLinks && (
              <>
                {/* Channel redirect cards */}
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
                  <p className="text-sm text-gray-600 mb-1">
                    ✅ 已同步開啟「<strong className="text-gray-900">{searchLinks.destination}</strong>」三平台比價
                    {search.intent !== 'all' && <span className="ml-2 text-xs font-bold text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">{INTENT_FILTERS[search.intent].label}</span>}
                    {searchLinks.checkIn && <span className="text-gray-400 text-xs ml-2">{searchLinks.checkIn} → {searchLinks.checkOut} · {searchLinks.adults}人 · {searchLinks.rooms}房</span>}
                  </p>
                  <p className="text-xs text-gray-400 mb-4">已同步開啟 3 個分頁。若視窗被擋，請點擊以下連結手動前往：</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <a href={searchLinks.agoda} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-[#4CAF50] text-white rounded-xl hover:bg-[#43A047] transition-all group">
                      <div className="text-2xl shrink-0">🏨</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-base">Agoda</div>
                        <div className="text-xs opacity-80 mt-0.5">含稅 · APP折扣 · TWD計價</div>
                      </div>
                      <div className="opacity-70 group-hover:opacity-100 shrink-0"><IconExternalLink /></div>
                    </a>
                    <a href={searchLinks.booking} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all group">
                      <div className="text-2xl shrink-0">🏨</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-base">Booking.com</div>
                        <div className="text-xs opacity-80 mt-0.5">免費取消 · Genius折扣 · 星級篩選</div>
                      </div>
                      <div className="opacity-70 group-hover:opacity-100 shrink-0"><IconExternalLink /></div>
                    </a>
                    <a href={searchLinks.trip} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-3 p-4 bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 transition-all group sm:col-span-2">
                      <div className="text-2xl shrink-0">✈️</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-black text-base">Trip.com</div>
                        <div className="text-xs opacity-80 mt-0.5">連退高回饋 · 地區隱藏價 · 高評分排序 · TWD計價</div>
                      </div>
                      <div className="opacity-70 group-hover:opacity-100 shrink-0"><IconExternalLink /></div>
                    </a>
                  </div>

                  {cardTips.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                      <p className="text-xs font-bold text-gray-600 mb-2">💳 你的信用卡建議：</p>
                      <div className="flex flex-wrap gap-2">
                        {cardTips.map((tip, i) => (
                          <span key={i} className="text-xs bg-amber-50 border border-amber-100 text-amber-800 px-2.5 py-1 rounded-full">
                            {tip.name} → {tip.tip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Dark search */}
                <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-5 sm:p-6 border border-gray-700">
                  <div className="flex items-start gap-4">
                    <div className="text-3xl shrink-0">🕵️</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-black text-white text-base mb-1">兩隻熊暗黑搜尋 — 全網漏網之魚</div>
                      <p className="text-gray-400 text-xs leading-relaxed mb-4">
                        OTA 上找不到的私密價，可能藏在 PTT、Dcard、Facebook 社團、LINE 社群或飯店 IG 限時動態裡。
                      </p>
                      <div className="flex gap-3 flex-wrap">
                        <button onClick={openDarkSearch}
                          className="flex items-center gap-2 px-4 py-2.5 bg-yellow-400 text-gray-900 text-sm font-black rounded-xl hover:bg-yellow-300 transition-colors">
                          🔍 Google 暗黑搜尋
                          <span className="text-xs font-medium opacity-60">「{search.hotelName || search.destination || '飯店'}」優惠碼...</span>
                        </button>
                        <a href="https://www.ptt.cc/bbs/Travel/search?q=飯店+優惠" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-green-600 text-white text-sm font-bold rounded-xl hover:bg-green-500 transition-colors">
                          PTT 旅遊版 <IconExternalLink />
                        </a>
                        <a href="https://www.dcard.tw/f/travel" target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1.5 px-4 py-2.5 bg-blue-500 text-white text-sm font-bold rounded-xl hover:bg-blue-400 transition-colors">
                          Dcard 旅遊版 <IconExternalLink />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* 5. AI CHAT PANEL */}
      <div className="fixed bottom-5 right-4 sm:right-6 z-50">
        {chatOpen ? (
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-100 flex flex-col overflow-hidden w-80 sm:w-96" style={{ height: 520 }}>
            <div className="bg-gradient-to-r from-[#8B5A2B] to-amber-600 px-4 py-3 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xl">🐻</span>
                <div>
                  <div className="text-white font-black text-sm">AI省錢小助手</div>
                  <div className="text-white/70 text-xs">Powered by 兩隻熊</div>
                </div>
              </div>
              <button onClick={() => setChatOpen(false)} className="text-white/80 hover:text-white p-0.5 transition-colors">
                <IconX />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3.5 space-y-3">
              {messages.map(msg => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={msg.role === 'user' ? 'max-w-[82%]' : 'w-full'}>
                    <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-line ${
                      msg.role === 'user'
                        ? 'bg-[#8B5A2B] text-white rounded-br-sm'
                        : 'bg-gray-50 text-gray-700 rounded-bl-sm border border-gray-100'}`}>
                      {msg.content}
                    </div>
                    {msg.suggestions && (
                      <div className="mt-2 space-y-2">
                        {msg.suggestions.map((s, i) => (
                          <button key={i} onClick={() => { setChatOpen(false); pickCity(s.searchQuery); }}
                            className="w-full text-left bg-white border border-gray-100 rounded-xl p-3 shadow-sm hover:border-[#8B5A2B] hover:shadow-md transition-all group">
                            <div className="flex items-start gap-2 mb-2">
                              <span className="text-xl shrink-0">{s.emoji}</span>
                              <div className="min-w-0 flex-1">
                                <div className="font-bold text-gray-950 text-xs leading-snug">{s.area}</div>
                                <span className="inline-block bg-amber-100 text-amber-700 text-xs px-1.5 py-0.5 rounded font-semibold mt-0.5">{s.tag}</span>
                              </div>
                              <span className="text-xs text-[#8B5A2B] font-bold shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">比價 →</span>
                            </div>
                            <div className="text-green-600 font-black text-sm mb-1.5">{s.price}</div>
                            <div className="space-y-0.5">
                              {s.pros.map((p, j) => <div key={j} className="text-xs text-gray-600 flex gap-1"><span className="text-green-500 shrink-0">✓</span>{p}</div>)}
                              {s.cons.map((c, j) => <div key={j} className="text-xs text-gray-400 flex gap-1"><span className="text-red-400 shrink-0">✗</span>{c}</div>)}
                            </div>
                            <div className="mt-2 pt-2 border-t border-gray-50 flex items-center gap-1 text-[#8B5A2B] text-xs font-semibold group-hover:text-amber-600">
                              <IconSearch /> 點擊搜尋「{s.searchQuery}」
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {typing && (
                <div className="flex items-center gap-2 text-gray-400 text-xs">
                  <div className="flex gap-1">
                    {[0,150,300].map(d => <span key={d} className="w-1.5 h-1.5 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
                  </div>
                  🐻 分析中...
                </div>
              )}
              <div ref={chatBottomRef} />
            </div>

            <div className="p-3 border-t border-gray-100 shrink-0">
              <div className="flex gap-2">
                <input type="text" value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
                  placeholder="東京五天四夜，兩人，預算兩萬..."
                  className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 placeholder:text-gray-500 focus:outline-none focus:border-[#8B5A2B] focus:ring-2 focus:ring-[#8B5A2B]/10 transition-all"
                />
                <button onClick={sendChat}
                  className="w-10 h-10 bg-[#8B5A2B] text-white rounded-xl flex items-center justify-center hover:bg-amber-700 transition-colors shrink-0">
                  <IconSend />
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button onClick={() => setChatOpen(true)}
            className="bg-gradient-to-r from-[#8B5A2B] to-amber-600 text-white rounded-full w-14 h-14 flex items-center justify-center shadow-xl hover:shadow-2xl transition-all hover:scale-110 active:scale-95">
            <span className="text-2xl">🐻</span>
          </button>
        )}
      </div>
    </div>
  );
}
