import React, { useState, useEffect } from 'react';

const TRACKING_BASE = 'https://abzcoupon.com/track/clicks/3408/c627c2ba900929dcfc9cab248d2596412379128f78eee2f40f76f6476a0449a8c23ae5a5112d';
const CID = '1933603';

type Intent = 'all' | 'luxury' | 'escape' | 'base';
type FilterTag = 'all' | 'luxury' | 'escape' | 'base' | 'japan' | 'sea';

interface IntentParam { extra: string; sort: string; label: string; detail: string; }

const INTENT_PARAMS: Record<Intent, IntentParam> = {
  all:    { extra: '', sort: 'popularity', label: '', detail: '顯示所有房型' },
  luxury: { extra: '&hotelStarRating=5&hotelReviewScore=9&roomAmenities=31&hotelFacility=91&groupedBedTypes=1,5', sort: 'price_desc', label: '✨ 5星・評分9+・特大床・Spa・含網路', detail: '最價格高→低排序' },
  escape: { extra: '&hotelReviewScore=9&roomAmenities=31&hotelFacility=91', sort: 'rating_desc', label: '🌿 評分9+・Spa・含網路', detail: '最評分高→低排序' },
  base:   { extra: '&hotelReviewScore=8&roomAmenities=31,42', sort: 'price_asc', label: '🏡 評分8+・免費取消・含網路', detail: '最價格低→高排序' },
};

const BOOKING_INTENT_PARAMS: Record<Intent, string> = {
  all:    'review_score=80',
  luxury: 'class=5;review_score=90;hotelfacility=433;roomfacility=5',
  escape: 'class=4;review_score=90;hotelfacility=433',
  base:   'review_score=80;roomfacility=999',
};

interface ResBar { label: string; width: number; level: 'high' | 'mid' | 'low'; }
interface City {
  id: number;
  flag: string;
  city: string;
  region: string;
  score: number;
  scoreClass: 'high' | 'mid' | 'low';
  tags: string[];
  intentTag: Exclude<Intent, 'all'>;
  quote: string;
  resilience: ResBar[];
  warning: string;
  tip: string;
  bookingCity: string;
}

const CITIES: City[] = [
  {
    id: 1784,
    flag: '🇯🇵',
    city: '京都・安頓',
    region: '日本關西・百年老靈',
    score: 87,
    scoreClass: 'high',
    tags: ['japan', 'escape'],
    intentTag: 'escape',
    quote: '瑪雅科學家提示：百年老靈在未來動盪中相對穩定。京都是台灣人心中最接近「靈魂」的地方。',
    resilience: [
      { label: '🏡 寧靜度', width: 92, level: 'high' },
      { label: '🚇 交通', width: 85, level: 'high' },
      { label: '🏪 機能', width: 70, level: 'mid' },
      { label: '☀️ 氣候', width: 75, level: 'mid' },
    ],
    warning: '⚠️ 避雷：祇園巷弄和嵐山旅館常見12㎡小房，行李箱無法攤平。嵐山徒步來回太累，帶行李箱請不要來。',
    tip: '✅ 推薦：烏丸御池和嵐山外圍可開車旅館，空間大、安靜，步行至車站為平路。',
    bookingCity: 'Kyoto',
  },
  {
    id: 5085,
    flag: '🇯🇵',
    city: '河口湖・富士山麗',
    region: '日本關東・富士山第一景',
    score: 72,
    scoreClass: 'mid',
    tags: ['japan', 'luxury'],
    intentTag: 'luxury',
    quote: '比格斯和瑪雅科學家都重複提到富士山的未來讀數。如果還有平靜的一年，這輩子總要任性一次，在第一景環湖拍富士山倒影。',
    resilience: [
      { label: '🏡 寧靜度', width: 90, level: 'high' },
      { label: '🚇 交通', width: 58, level: 'mid' },
      { label: '🏪 機能', width: 52, level: 'mid' },
      { label: '☀️ 氣候', width: 62, level: 'mid' },
    ],
    warning: '⚠️ 避雷：河口湖交通靠巴士，等次班時間長，冬季氣溫極低需備厚衣。',
    tip: '✅ 推薦：湖岸一線方景旅館，清晨富士山倒影絕景，秋楓和冬雪季節值得等待。',
    bookingCity: 'Kawaguchiko',
  },
  {
    id: 9590,
    flag: '🇯🇵',
    city: '大阪',
    region: '日本關西・美食之都',
    score: 68,
    scoreClass: 'mid',
    tags: ['japan', 'luxury'],
    intentTag: 'luxury',
    quote: '世界亂了，大阪的章魚燒一直都在。這是那種「讓人忘記煩惱」的城市，吃飽喝足，煩惱自然就少一個。',
    resilience: [
      { label: '🏡 寧靜度', width: 55, level: 'low' },
      { label: '🚇 交通', width: 90, level: 'high' },
      { label: '🏪 機能', width: 95, level: 'high' },
      { label: '☀️ 氣候', width: 85, level: 'high' },
    ],
    warning: '⚠️ 避雷：新今宮廉價旅館周邊環境複雜。心齋橋精品旅館雙人房常只有11㎡鳥籠空間。',
    tip: '✅ 推薦：北梅田和堂島周邊旅館，空間大、鄰近美食，治安好住得安穩。',
    bookingCity: 'Osaka',
  },
  {
    id: 14690,
    flag: '🇰🇷',
    city: '首爾',
    region: '韓國・最佳美食之都',
    score: 70,
    scoreClass: 'mid',
    tags: ['luxury'],
    intentTag: 'luxury',
    quote: '哈伯說韓國邊境局勢是未來幾年的讀數，但首爾人完全不在意——他們在烤肉、逛街，這種日常活著，才是最強的心理韌性。',
    resilience: [
      { label: '🏡 寧靜度', width: 65, level: 'mid' },
      { label: '🚇 交通', width: 95, level: 'high' },
      { label: '🏪 機能', width: 92, level: 'high' },
      { label: '☀️ 氣候', width: 70, level: 'mid' },
    ],
    warning: '⚠️ 避雷：弘大商旅平均15㎡，行李箱請選拉桿矮小型。部分旅館電梯只容下一個行李箱。',
    tip: '✅ 推薦：漢南洞一帶和南山水洗設計旅館，空間最佳，步行逛街方便，夜間安全。',
    bookingCity: 'Seoul',
  },
  {
    id: 9395,
    flag: '🇹🇭',
    city: '曼谷',
    region: '泰國・CP值天花板',
    score: 82,
    scoreClass: 'high',
    tags: ['sea', 'base', 'luxury'],
    intentTag: 'base',
    quote: '摩根看好泰國在未來亂局中相對穩定。更實際的是，同樣的錢，曼谷能讓你住得比台灣好整整一個等級。',
    resilience: [
      { label: '🏡 寧靜度', width: 72, level: 'mid' },
      { label: '🚇 交通', width: 78, level: 'mid' },
      { label: '🏪 機能', width: 96, level: 'high' },
      { label: '☀️ 氣候', width: 88, level: 'high' },
    ],
    warning: '⚠️ 避雷：素坤蔚路雨季積水嚴重，行李箱是惡夢。BTS 站外叫車 App 比 Grab 貴。',
    tip: '✅ 推薦：Ari 和 Phromphong 站鄰近旅館，週季長住有大幅折扣，適合長住型旅客。',
    bookingCity: 'Bangkok',
  },
  {
    id: 4064,
    flag: '🇸🇬',
    city: '新加坡',
    region: '東南亞・避風港首選',
    score: 90,
    scoreClass: 'high',
    tags: ['sea', 'base'],
    intentTag: 'base',
    quote: '在全球亂世中常年是避難港。政治穩定、法治完善、雙語通行。比格斯說的財富轉移，這裡是高淨值人士首選的落腳地。',
    resilience: [
      { label: '🏡 寧靜度', width: 94, level: 'high' },
      { label: '🚇 交通', width: 96, level: 'high' },
      { label: '🏪 機能', width: 98, level: 'high' },
      { label: '☀️ 氣候', width: 95, level: 'high' },
    ],
    warning: '⚠️ 避雷：住宿費是亞洲最貴之一，同樣預算在曼谷可以住到好一個等級的飯店。',
    tip: '✅ 推薦：武吉士和聖陶沙碼頭旅館，週季長住折扣比週次省 50% 以上。',
    bookingCity: 'Singapore',
  },
  {
    id: 4951,
    flag: '🇹🇼',
    city: '台北',
    region: '台灣・家的起點',
    score: 65,
    scoreClass: 'mid',
    tags: ['base'],
    intentTag: 'base',
    quote: '如果你都還沒把台灣好好走過，先把自己的寶島清單做好吧。台北的住宿 CP 值其實比想像中好。',
    resilience: [
      { label: '🏡 寧靜度', width: 70, level: 'mid' },
      { label: '🚇 交通', width: 88, level: 'high' },
      { label: '🏪 機能', width: 96, level: 'high' },
      { label: '☀️ 氣候', width: 60, level: 'mid' },
    ],
    warning: '⚠️ 避雷：西區舊式旅館隔音極差，可能聽到隔壁電視聲。林森北路夜間環境複雜。',
    tip: '✅ 推薦：大安區和中山設計旅館，空間大、安靜，步行生活圈完整。',
    bookingCity: 'Taipei',
  },
];

const INTENT_LABELS: Record<Exclude<Intent, 'all'>, string> = {
  luxury: '✨ 奢享一次',
  escape: '🌿 逃離日常',
  base:   '🏡 長住輕居',
};
const INTENT_TAG_CLASS: Record<Exclude<Intent, 'all'>, string> = {
  luxury: 'tag-luxury',
  escape: 'tag-escape',
  base:   'tag-base',
};

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function buildUrl(cityId: number, checkIn: string, checkOut: string, adults: number, rooms: number, intent: Intent): string {
  const p = INTENT_PARAMS[intent];
  const agoda =
    'https://www.agoda.com/zh-tw/search' +
    '?city=' + cityId +
    '&checkIn=' + checkIn +
    '&checkOut=' + checkOut +
    '&rooms=' + rooms +
    '&adults=' + adults +
    '&locale=zh-tw&currency=TWD' +
    '&sort=' + p.sort +
    p.extra +
    '&cid=' + CID +
    '&productType=-1';
  return TRACKING_BASE + '?t=' + encodeURIComponent(encodeURIComponent(agoda));
}

function buildBookingUrl(bookingCity: string, checkIn: string, checkOut: string, adults: number, rooms: number, intent: Intent): string {
  const filters = BOOKING_INTENT_PARAMS[intent];
  return `https://www.booking.com/searchresults.zh-tw.html?ss=${encodeURIComponent(bookingCity)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${adults}&no_rooms=${rooms}&nflt=${encodeURIComponent(filters)}&lang=zh-tw`;
}

export default function TravelPage() {
  const [checkIn, setCheckIn]   = useState(() => addDays(30));
  const [checkOut, setCheckOut] = useState(() => addDays(33));
  const [adults, setAdults]     = useState(2);
  const [rooms, setRooms]       = useState(1);
  const [intent, setIntent]     = useState<Intent>('all');
  const [filter, setFilter]     = useState<FilterTag>('all');

  const FILTER_LABELS: Record<FilterTag, string> = {
    all:    '全部',
    luxury: '✨ 奢享',
    escape: '🌿 逃離',
    base:   '🏡 長住',
    japan:  '🇯🇵 日本',
    sea:    '🌊 東南亞',
  };

  function handleIntent(i: Intent) {
    setIntent(i);
    const map: Record<Intent, FilterTag> = { all: 'all', luxury: 'luxury', escape: 'escape', base: 'base' };
    setFilter(map[i]);
  }

  function handleFilter(f: FilterTag) {
    setFilter(f);
  }

  function handleCheckIn(val: string) {
    setCheckIn(val);
    if (val >= checkOut) {
      const d = new Date(val);
      d.setDate(d.getDate() + 3);
      setCheckOut(d.toISOString().split('T')[0]);
    }
  }

  function goAgoda(city: City) {
    window.open(buildUrl(city.id, checkIn, checkOut, adults, rooms, intent), '_blank', 'noopener');
  }

  const visible = filter === 'all' ? CITIES : CITIES.filter(c => c.tags.includes(filter));
  const iparams = INTENT_PARAMS[intent];

  useEffect(() => {
    const cards = document.querySelectorAll('.tp-city-card');
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('tp-animated'); obs.unobserve(e.target); }
      });
    }, { threshold: 0.15 });
    cards.forEach(c => obs.observe(c));
    return () => obs.disconnect();
  }, [filter]);

  return (
    <div className="tp-root">

      {/* Hero */}
      <div className="tp-hero">
        <div className="tp-hero-bears">🐻🐻</div>
        <div className="tp-hero-eyebrow">兩隻熊的人生清單 · BUCKET LIST TRAVEL</div>
        <h1 className="tp-hero-h1">如果世界越來越亂，<br />你<em>還想去哪裡</em>？</h1>
        <p className="tp-hero-sub">預言家說的那些事也許不會發生，但有些地方、有些時刻，值得你現在就出發。</p>
      </div>

      {/* Sticky search */}
      <div className="tp-search-wrap">
        <div className="tp-search-inner">
          <label className="tp-search-label">入住</label>
          <input type="date" className="tp-search-input" value={checkIn} min={addDays(0)} onChange={e => handleCheckIn(e.target.value)} />
          <label className="tp-search-label">退房</label>
          <input type="date" className="tp-search-input" value={checkOut} min={checkIn} onChange={e => setCheckOut(e.target.value)} />
          <label className="tp-search-label">大人</label>
          <select className="tp-search-select" value={adults} onChange={e => setAdults(Number(e.target.value))}>
            {[1,2,3,4].map(n => <option key={n} value={n}>{n}人</option>)}
          </select>
          <label className="tp-search-label">房間</label>
          <select className="tp-search-select" value={rooms} onChange={e => setRooms(Number(e.target.value))}>
            {[1,2].map(n => <option key={n} value={n}>{n}間</option>)}
          </select>
        </div>
      </div>

      {/* Filter bar */}
      <div className="tp-filter-wrap">
        <div className="tp-filter-inner">
          <span className="tp-filter-label">篩選</span>
          {(Object.keys(FILTER_LABELS) as FilterTag[]).map(f => (
            <button
              key={f}
              className={`tp-filter-btn${filter === f ? ' active' : ''}`}
              onClick={() => handleFilter(f)}
            >{FILTER_LABELS[f]}</button>
          ))}
        </div>
      </div>

      <div className="tp-main">

        {/* Prophet strip */}
        <div className="tp-prophet-strip">
          <div className="tp-prophet-card">
            <div className="tp-prophet-name">BRANDON BIGGS</div>
            <div className="tp-prophet-quote">「財富將會轉移。在最後的日子裡，那些準備好的人將有足夠的資源。」</div>
          </div>
          <div className="tp-prophet-card">
            <div className="tp-prophet-name">瑪雅科學家</div>
            <div className="tp-prophet-quote">「百年老靈在未來動盪中相對穩定。去那些有歷史的地方讓自己安頓一下吧。」</div>
          </div>
          <div className="tp-prophet-card">
            <div className="tp-prophet-name">JOE McMONEAGLE</div>
            <div className="tp-prophet-quote">「在混亂之後，找到讓你的心回到平靜的地方。清空大腦，你會發現世界其實很平靜。」</div>
          </div>
        </div>

        {/* Intent row */}
        <div className="tp-intent-row">
          {([['all','🗺','全部顯示','讓自己決定'],['luxury','🥂','奢享一次','4星以上・高景觀・頂級體驗'],['escape','🌿','逃離日常','溫泉・秘境・最高評分優先'],['base','🏡','長住輕居','免費退訂・長住・最低均價']] as const).map(([id, icon, title, desc]) => (
            <button
              key={id}
              className={`tp-intent-btn${intent === id ? ' active' : ''}`}
              onClick={() => handleIntent(id as Intent)}
            >
              <div className="tp-intent-icon">{icon}</div>
              <div className="tp-intent-title">{title}</div>
              <div className="tp-intent-desc">{desc}</div>
            </button>
          ))}
        </div>

        {intent !== 'all' && (
          <div className="tp-intent-badge">
            <span>🎯 目前篩選條件：</span>
            <strong>{iparams.label}</strong>
            <span>· {iparams.detail}</span>
          </div>
        )}

        <div className="tp-section-title">🐻 兩隻熊的人生清單 · 精選目的地</div>

        <div className="tp-city-grid">
          {visible.map(city => (
            <div key={city.city} className="tp-city-card">
              <div className="tp-card-header">
                <div className="tp-card-flag">{city.flag}</div>
                <div className="tp-card-city">{city.city}</div>
                <div className="tp-card-region">{city.region}</div>
                <div className={`tp-card-score score-${city.scoreClass}`}>{city.score}</div>
              </div>
              <div className="tp-card-body">
                <div className={`tp-intent-tag ${INTENT_TAG_CLASS[city.intentTag]}`}>
                  {INTENT_LABELS[city.intentTag]}
                </div>
                <div className="tp-card-quote">{city.quote}</div>
                <div className="tp-resilience">
                  <div className="tp-resilience-title">韌性指數</div>
                  <div className="tp-resilience-bars">
                    {city.resilience.map((bar, i) => (
                      <div key={i} className="tp-r-bar">
                        <span className="tp-r-label">{bar.label}</span>
                        <div className="tp-r-track">
                          <div
                            className={`tp-r-fill${bar.level === 'high' ? ' high' : bar.level === 'low' ? ' low' : ''}`}
                            style={{ '--tw': `${bar.width}%` } as React.CSSProperties}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="tp-card-warning">{city.warning}</div>
                <div className="tp-card-tip">{city.tip}</div>
              </div>
              <div className="tp-card-footer">
                <button className="tp-book-btn primary" onClick={() => goAgoda(city)}>
                  🔍 搜尋{city.city.split('・')[0]}住宿
                </button>
                <a className="tp-book-btn" href={buildBookingUrl(city.bookingCity, checkIn, checkOut, adults, rooms, intent)} target="_blank" rel="noopener noreferrer">
                  Booking
                </a>
              </div>
            </div>
          ))}
        </div>

        <p className="tp-disclaimer">
          ▲ 韌性指數為兩隻熊主觀評估，供參考。避雷資訊來自台灣旅客實際回報，更新於 2026 年。<br />
          本頁部分連結為聯盟連結，點擊訂房不增加你的費用，但有助支持兩隻熊繼續製作內容 🐻
        </p>

      </div>
    </div>
  );
}
