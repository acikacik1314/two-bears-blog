import React, { useState } from 'react';
import { REGIONS, PAIN_MAP, type PainKey } from '../data/avoidData';
import { AGODA_TRACKING, BOOKING_TRACKING, deepLink } from '../config/affiliates';


const PAIN_LIST = [
  { id: 'luggage',        label: '29吋行李箱打不開',                emoji: '🧳' },
  { id: 'walking',        label: '官方說5分/實測走15分有大坡',       emoji: '🚶‍♂️' },
  { id: 'no_food',        label: '晚上10點後沒宵夜變荒漠',           emoji: '🍜' },
  { id: 'noisy',          label: '隔音差、隔壁打呼一起參與',         emoji: '😴' },
  { id: 'elder_trap',     label: '帶爸媽長輩/推車有純樓梯地獄',      emoji: '🧓' },
  { id: 'rain_collapse',  label: '下雨天一出站直接迷航崩潰',         emoji: '☔' },
  { id: 'female_stress',  label: '女性獨旅回飯店路段太複雜',         emoji: '👩' },
  { id: 'bad_bed',        label: '床鋪窄小/超難睡（行軍床地獄）',    emoji: '🛏️' },
] as const;

// 取得所有城市清單（平展）
const ALL_CITIES = REGIONS.flatMap(r => r.cities);

function painColor(score: number): string {
  if (score >= 5) return 'bg-red-500 text-white';
  if (score >= 4) return 'bg-orange-400 text-white';
  if (score >= 3) return 'bg-yellow-400 text-stone-900';
  if (score >= 2) return 'bg-green-200 text-green-900';
  return 'bg-stone-100 text-stone-500';
}

function painLabel(score: number): string {
  if (score >= 5) return '地獄';
  if (score >= 4) return '高危';
  if (score >= 3) return '注意';
  if (score >= 2) return '輕微';
  return '安全';
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function buildAgodaUrl(area: typeof PAIN_MAP[0], checkIn: string, checkOut: string, rooms: number, adults: number, selectedPains: string[]): string {
  let sort = 'popularity';
  let reviewScore = '';
  if (selectedPains.includes('noisy')) {
    sort = 'rating_desc'; reviewScore = '9';
  } else if (selectedPains.some(p => ['luggage','bad_bed','female_stress'].includes(p))) {
    reviewScore = '8'; sort = 'rating_desc';
  } else if (selectedPains.length > 0) {
    sort = 'rating_desc'; reviewScore = '8';
  }
  const reviewParam = reviewScore ? `&hotelReviewScore=${reviewScore}` : '';
  const base = `https://www.agoda.com/zh-tw/search?city=${area.agodaCityId}&checkIn=${checkIn}&checkOut=${checkOut}&rooms=${rooms}&adults=${adults}&locale=zh-tw&currency=TWD&sort=${sort}${reviewParam}`;
  return deepLink(AGODA_TRACKING, base);
}

function buildBookingUrl(area: typeof PAIN_MAP[0], checkIn: string, checkOut: string, rooms: number, adults: number, selectedPains: string[]): string {
  const qualityPains = ['noisy', 'luggage', 'bad_bed', 'female_stress', 'no_food'];
  let reviewScore = '80';
  if (selectedPains.some(p => qualityPains.includes(p))) reviewScore = '90';
  const nflt = selectedPains.length > 0 ? `&nflt=review_score%3D${reviewScore}` : '';
  const bookingUrl = `https://www.booking.com/searchresults.zh-tw.html?ss=${encodeURIComponent(area.bookingArea)}&checkin=${checkIn}&checkout=${checkOut}&group_adults=${adults}&no_rooms=${rooms}${nflt}`;
  return deepLink(BOOKING_TRACKING, bookingUrl);
}

type ResultArea = typeof PAIN_MAP[0] & { userPainTotal: number };

export default function AvoidPage() {
  const [cityName, setCityName]   = useState('東京');
  const [rooms, setRooms]         = useState(1);
  const [adults, setAdults]       = useState(2);
  const [checkIn, setCheckIn]     = useState(() => addDays(7));
  const [checkOut, setCheckOut]   = useState(() => addDays(10));
  const [selectedPains, setSelectedPains] = useState<string[]>([]);
  const [hasSearched, setHasSearched]     = useState(false);
  const [results, setResults]             = useState<ResultArea[]>([]);
  const [isIronUser, setIsIronUser]       = useState(false);

  function togglePain(id: string) {
    setSelectedPains(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  }

  function handleCheckIn(val: string) {
    setCheckIn(val);
    if (val >= checkOut) {
      const d = new Date(val);
      d.setDate(d.getDate() + 3);
      setCheckOut(d.toISOString().split('T')[0]);
    }
  }

  function handleCalculate() {
    const iron = selectedPains.length === 0;
    setIsIronUser(iron);
    const cityAreas = PAIN_MAP.filter(a => a.city === cityName);
    const calculated: ResultArea[] = cityAreas.map(area => {
      const total = iron
        ? (Object.values(area.painScores) as number[]).reduce((s, v) => s + v, 0)
        : selectedPains.reduce((sum, pid) => sum + (area.painScores[pid as PainKey] ?? 0), 0);
      return { ...area, userPainTotal: total };
    }).sort((a, b) => b.userPainTotal - a.userPainTotal);
    setResults(calculated);
    setHasSearched(true);
    setTimeout(() => {
      document.getElementById('avoid-results')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  }

  const maxScore = isIronUser
    ? PAIN_LIST.length * 5
    : Math.max(selectedPains.length * 5, 1);

  const nights = Math.max(1, Math.round(
    (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86400000
  ));

  const currentRegion = REGIONS.find(r => r.cities.some(c => c.value === cityName))?.label ?? '';

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans pb-24">

      {/* Hero */}
      <div className="bg-gradient-to-b from-stone-900 to-stone-800 text-white px-4 pt-12 pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-block bg-rose-600 text-white text-xs font-black px-3 py-1 rounded-full mb-4 tracking-wider uppercase">
            ⚠️ 台灣人出國避痛大腦 v2.2
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            🐻 不踩雷，比便宜更重要。
          </h1>
          <p className="text-stone-300 text-base leading-relaxed max-w-xl mx-auto">
            44 個城市 · 136 個熱門住宿區 · 設定行程、勾選最怕的痛苦，兩隻熊幫你診斷哪些區域要遠離。
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 -mt-6">

        {/* 行程設定 */}
        <div className="bg-white border-2 border-stone-900 rounded-2xl p-6 shadow-xl mb-6">
          <h2 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">行程設定</h2>

          {/* 目的地：地區分組 */}
          <div className="mb-3">
            <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">目的地</label>
            <select
              value={cityName}
              onChange={e => { setCityName(e.target.value); setHasSearched(false); }}
              className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white"
            >
              {REGIONS.map(region => (
                <optgroup key={region.label} label={`── ${region.label} ──`}>
                  {region.cities.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            {currentRegion && (
              <p className="text-xs text-stone-400 mt-1">
                {currentRegion} · {PAIN_MAP.filter(a => a.city === cityName).length} 個住宿區域收錄中
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">房間數</label>
              <select value={rooms} onChange={e => setRooms(Number(e.target.value))}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white">
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 間</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">入住人數</label>
              <select value={adults} onChange={e => setAdults(Number(e.target.value))}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white">
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 人</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">入住日期</label>
              <input type="date" value={checkIn} min={addDays(0)}
                onChange={e => handleCheckIn(e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none" />
            </div>
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">退房日期</label>
              <input type="date" value={checkOut} min={checkIn}
                onChange={e => setCheckOut(e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none" />
            </div>
          </div>

          <p className="text-xs text-stone-400 mt-3 text-right">
            {cityName} · {nights} 晚 · {rooms} 間 · {adults} 人
          </p>
        </div>

        {/* 痛苦選擇 */}
        <div className="bg-white border-2 border-stone-900 rounded-2xl p-6 shadow-xl mb-8">
          <h2 className="text-lg font-black text-stone-900 mb-1">
            🔍 這次出國，你最怕遇到什麼痛苦？
          </h2>
          <p className="text-xs text-stone-400 mb-4">
            可多選 · 若全不選，兩隻熊直接幫你跑「{cityName}綜合危險大排行」
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
            {PAIN_LIST.map(pain => {
              const checked = selectedPains.includes(pain.id);
              return (
                <button key={pain.id} onClick={() => togglePain(pain.id)}
                  className={`border-2 rounded-xl p-4 text-left transition-all flex items-start gap-3 select-none ${
                    checked ? 'border-rose-600 bg-rose-50 shadow-sm' : 'border-stone-200 hover:border-stone-400 bg-white'
                  }`}>
                  <span className="text-xl mt-0.5 shrink-0">{pain.emoji}</span>
                  <p className={`text-sm font-bold flex-1 leading-snug ${checked ? 'text-rose-900' : 'text-stone-700'}`}>
                    {pain.label}
                  </p>
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center text-xs shrink-0 mt-0.5 ${
                    checked ? 'bg-rose-600 border-rose-600 text-white font-black' : 'border-stone-300'
                  }`}>
                    {checked && '✓'}
                  </div>
                </button>
              );
            })}
          </div>

          {selectedPains.length > 0 && (
            <p className="text-xs text-stone-500 mb-4 text-center">
              已選 {selectedPains.length} 項痛點 · 分析 {cityName} {PAIN_MAP.filter(a => a.city === cityName).length} 個熱門住宿區
            </p>
          )}

          <button onClick={handleCalculate}
            className="w-full bg-rose-600 hover:bg-rose-700 active:scale-[.99] text-white font-black py-4 px-6 rounded-xl transition-all shadow-md text-lg flex items-center justify-center gap-2">
            🔥 開始幫我肉眼避雷 →
          </button>
        </div>

        {/* 診斷結果 */}
        {hasSearched && (
          <div id="avoid-results" className="space-y-6">

            <div className="border-b-2 border-stone-900 pb-3">
              <h3 className="text-xl font-black text-stone-900">🚨 兩隻熊診斷報告</h3>
              <p className="text-xs text-stone-400 mt-1">
                {cityName} · 分數越高代表對你越地獄 · 更新：2026年6月
              </p>
            </div>

            {isIronUser && (
              <div className="bg-amber-100 border-2 border-amber-400 rounded-2xl p-4 flex items-start gap-3">
                <span className="text-2xl shrink-0">💪</span>
                <div>
                  <p className="text-sm font-black text-amber-900">偵測到「鋼鐵無痛超人」！</p>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    兩隻熊已自動為您載入 {cityName}【綜合雷度最高】的魔王大排行。您體感無痛，但地雷還是存在的 🐻
                  </p>
                </div>
              </div>
            )}

            {results.map((area, idx) => {
              const dangerPct = Math.round((area.userPainTotal / maxScore) * 100);
              const isTop = idx === 0;

              return (
                <div key={area.name}
                  className={`bg-white rounded-2xl shadow-sm relative overflow-hidden border-2 ${
                    isTop ? 'border-rose-500 shadow-rose-100' : 'border-stone-200'
                  }`}>
                  <div className={`absolute top-0 right-0 text-xs font-black px-4 py-1.5 rounded-bl-xl ${
                    isTop ? 'bg-rose-600 text-white' : 'bg-stone-900 text-amber-400'
                  }`}>
                    {isTop ? '🚨 最危險' : `危險 No.${idx + 1}`}
                  </div>

                  <div className="p-5 sm:p-6">
                    <div className="mb-3 pr-20">
                      <span className="text-xs font-black uppercase tracking-wider bg-stone-100 text-stone-600 px-2 py-0.5 rounded">
                        {area.city}
                      </span>
                      <h4 className="text-lg font-extrabold text-stone-900 mt-1">{area.name}</h4>
                      <p className="text-sm font-bold text-rose-600 mt-1">💥 {area.tagline}</p>
                    </div>

                    {/* 危險儀表 */}
                    <div className="mb-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-bold text-stone-500">
                          {isIronUser ? '綜合雷度' : '對你的踩雷指數'}
                        </span>
                        <span className={`text-xs font-black px-2 py-0.5 rounded-full ${
                          dangerPct >= 80 ? 'bg-red-100 text-red-700' :
                          dangerPct >= 60 ? 'bg-orange-100 text-orange-700' :
                          'bg-yellow-100 text-yellow-700'
                        }`}>{dangerPct}%</span>
                      </div>
                      <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all ${
                          dangerPct >= 80 ? 'bg-red-500' :
                          dangerPct >= 60 ? 'bg-orange-400' : 'bg-yellow-400'
                        }`} style={{ width: `${dangerPct}%` }} />
                      </div>
                    </div>

                    {/* 痛苦明細格子 */}
                    <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mb-4">
                      {PAIN_LIST.map(p => {
                        const score = area.painScores[p.id as PainKey];
                        const highlight = isIronUser || selectedPains.includes(p.id);
                        return (
                          <div key={p.id}
                            className={`rounded-lg p-1.5 text-center transition-all ${
                              highlight ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-40'
                            } ${painColor(score)}`}
                            title={`${p.label}：${painLabel(score)}`}>
                            <div className="text-base leading-none">{p.emoji}</div>
                            <div className="text-xs font-black mt-0.5">{painLabel(score)}</div>
                          </div>
                        );
                      })}
                    </div>

                    {/* 熊大師判決 */}
                    <div className="bg-stone-900 text-stone-100 p-4 rounded-xl mb-4 relative">
                      <span className="absolute -top-3 -left-2 text-2xl">🐻</span>
                      <p className="text-sm font-medium leading-relaxed pl-4">
                        <span className="text-amber-400 font-black">兩隻熊實判定：</span>
                        {area.bearVerdict}
                      </p>
                    </div>

                    {/* 避痛標準 */}
                    <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl mb-4">
                      <h5 className="text-sm font-black text-emerald-900 mb-2">
                        💡 兩隻熊傳授：該區選飯店的【避痛防禦標準】
                      </h5>
                      <p className="text-sm text-emerald-800 font-medium leading-relaxed">
                        {area.defenseAdvice}
                      </p>
                    </div>

                    {/* Platform CTAs */}
                    <div className="grid grid-cols-2 gap-3">
                      <a href={buildAgodaUrl(area, checkIn, checkOut, rooms, adults, selectedPains)}
                        target="_blank" rel="sponsored nofollow noopener"
                        className="flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors">
                        🔍 搜尋安全替代區域（Agoda）
                      </a>
                      <a href={buildBookingUrl(area, checkIn, checkOut, rooms, adults, selectedPains)}
                        target="_blank" rel="sponsored nofollow noopener"
                        className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors">
                        🔍 搜尋安全替代區域（Booking）
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
              <p className="text-sm font-bold text-amber-800 mb-1">🐻 兩隻熊溫馨提醒</p>
              <p className="text-xs text-amber-700 leading-relaxed">
                以上分析基於常見踩雷回報，個人體驗因時因人而異。<br />
                最終訂房前建議多看近期 Google Maps 評論與 PTT 旅遊板。
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
