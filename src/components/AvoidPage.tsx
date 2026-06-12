import React, { useState } from 'react';

const AGODA_TRACKING = 'https://abzcoupon.com/track/clicks/3408/c627c2ba900929dcfc9cab248d2596412379128f78eee2f40f76f6476a0449a8c23ae5a5112d';
const AGODA_CID      = '1933603';
const BOOKING_AID    = '304142';

const BOOKING_CITY_EN: Record<string, string> = {
  '東京': 'Tokyo',
  '大阪': 'Osaka',
  '京都': 'Kyoto',
  '首爾': 'Seoul',
  '曼谷': 'Bangkok',
  '新加坡': 'Singapore',
};

const CITY_OPTIONS = [
  { label: '東京', value: '東京', id: 5085 },
  { label: '大阪', value: '大阪', id: 9590 },
  { label: '京都', value: '京都', id: 1784 },
  { label: '首爾', value: '首爾', id: 14690 },
  { label: '曼谷', value: '曼谷', id: 9395 },
  { label: '新加坡', value: '新加坡', id: 4064 },
];

const PAIN_LIST = [
  { id: 'luggage',       label: '29吋行李箱打不開',                emoji: '🧳' },
  { id: 'walking',       label: '官方說5分/實測走15分有大坡',       emoji: '🚶‍♂️' },
  { id: 'no_food',       label: '晚上10點後沒宵夜變荒漠',           emoji: '🍜' },
  { id: 'noisy',         label: '隔音差、隔壁打呼一起參與',         emoji: '😴' },
  { id: 'elder_trap',    label: '帶爸媽長輩/推車有純樓梯地獄',      emoji: '🧓' },
  { id: 'rain_collapse', label: '下雨天一出站直接迷航崩潰',         emoji: '☔' },
  { id: 'female_stress', label: '女性獨旅回飯店路段太複雜',         emoji: '👩' },
  { id: 'bad_bed',       label: '床鋪窄小/超難睡（行軍床地獄）',    emoji: '🛏️' },
];

type PainKey = 'luggage' | 'walking' | 'no_food' | 'noisy' | 'elder_trap' | 'rain_collapse' | 'female_stress' | 'bad_bed';

interface AreaProfile {
  name: string;
  city: string;
  tagline: string;
  painScores: Record<PainKey, number>;
  bearVerdict: string;
  defenseAdvice: string;
  agodaCityId: number;
  bookingArea: string;
}

const COMPREHENSIVE_PAIN_MAP: AreaProfile[] = [
  // ── 東京 ───────────────────────────────────────────────────────────
  {
    name: '新宿歌舞伎町周邊',
    city: '東京',
    tagline: '交通最方便，但夜晚帶家人是場災難',
    painScores: { luggage: 4, walking: 5, no_food: 1, noisy: 5, elder_trap: 3, rain_collapse: 5, female_stress: 4, bad_bed: 4 },
    bearVerdict: '新宿站是全日本最大的迷宮，官網寫「走路3分鐘」是不帶行李、不迷路、走特戰速度的結果。歌舞伎町晚上滿街是案內人和喝醉的外國人，帶長輩或小孩走這段會非常後悔。預算型商務旅館房間普遍12-14㎡，兩個人加兩個行李箱，根本沒有轉身空間。',
    defenseAdvice: '指定西口或南口徒步5分鐘內、樓層在4樓以上（隔音較好）、房間標示16㎡以上的旅館。或直接往西新宿移動，價格差不多但安靜很多。',
    agodaCityId: 5085,
    bookingArea: '新宿',
  },
  {
    name: '池袋北口周邊',
    city: '東京',
    tagline: '便宜陷阱，換個出口世界大不同',
    painScores: { luggage: 3, walking: 2, no_food: 1, noisy: 4, elder_trap: 2, rain_collapse: 3, female_stress: 4, bad_bed: 3 },
    bearVerdict: '池袋東口是陽光城和百貨公司，西口是家電和拉麵，但「北口」是完全不同的世界——風俗店、中國料理和夜間治安複雜的混合區。很多比價網站列出的超便宜旅館就在這一帶，省了500元台幣卻換來每晚走夜路的不安。',
    defenseAdvice: '池袋住宿請指定「東口徒步5分鐘內」或明確標示「近太陽城」，多花NT$300-500絕對值得。女性獨旅強烈建議避開北口所有旅館。',
    agodaCityId: 5085,
    bookingArea: '池袋',
  },
  {
    name: '淺草/藏前老街區',
    city: '東京',
    tagline: '江戶風情美，但晚上8點後只剩你和便利商店',
    painScores: { luggage: 3, walking: 2, no_food: 5, noisy: 2, elder_trap: 5, rain_collapse: 2, female_stress: 1, bad_bed: 2 },
    bearVerdict: '淺草白天非常美，但這區是東京最早關店的觀光區之一。晚上8點後絕大多數餐廳收攤，你能依靠的只剩Lawson和7-11。更要命的是淺草線部分老舊車站出口完全沒有電梯，29吋行李箱要爬三層樓梯——帶長輩或嬰兒車者請務必提前確認。',
    defenseAdvice: '選飯店時確認最近地鐵出口有無電梯，並確認飯店1樓或附近50公尺內有便利商店。宵夜愛好者請改住上野或秋葉原一帶。',
    agodaCityId: 5085,
    bookingArea: '浅草',
  },
  {
    name: '上野阿美橫丁周邊',
    city: '東京',
    tagline: '超鬧市場旁，白天熱鬧夜晚吵到睡不著',
    painScores: { luggage: 4, walking: 1, no_food: 2, noisy: 5, elder_trap: 2, rain_collapse: 1, female_stress: 2, bad_bed: 4 },
    bearVerdict: '上野的交通無可挑剔，成田機場直達、去哪都方便。但阿美橫丁市場一帶的旅館隔音是東京最差之一，早上6點市場就開始搬貨卸貨，你的睡眠從此不完整。房間普遍偏小，這區的商務旅館性價比其實不如周邊的日暮里或鶯谷。',
    defenseAdvice: '上野住宿請選地圖上遠離阿美橫丁至少200公尺、標示有雙層隔音窗的旅館。或往北走5分鐘選日暮里，同樣方便但便宜又安靜。',
    agodaCityId: 5085,
    bookingArea: '上野',
  },
  // ── 大阪 ───────────────────────────────────────────────────────────
  {
    name: '新今宮/動物園前',
    city: '大阪',
    tagline: '全日本最便宜，但代價你要想清楚',
    painScores: { luggage: 4, walking: 2, no_food: 2, noisy: 4, elder_trap: 3, rain_collapse: 2, female_stress: 5, bad_bed: 4 },
    bearVerdict: 'NT$600-800的單人房看起來CP值極高，但這裡緊鄰大阪著名的「愛鄰地區」，是日本最密集的遊民聚居區之一。晚上出站的街廓氛圍、氣味和路上的人，對台灣家庭旅客的衝擊非常大。星野集團進駐確實讓部分區域改善，但周邊仍然複雜。女性獨旅請完全迴避。',
    defenseAdvice: '同樣的錢往北移到難波或日本橋，多花NT$300-500可以住到完全不同等級的環境。絕對不要因為「反正只是睡覺」就選這區。',
    agodaCityId: 9590,
    bookingArea: '新今宮 大阪',
  },
  {
    name: '心齋橋/道頓堀核心區',
    city: '大阪',
    tagline: '下樓就是章魚燒，但你的耳朵和行李箱都會哭',
    painScores: { luggage: 5, walking: 1, no_food: 1, noisy: 5, elder_trap: 2, rain_collapse: 1, female_stress: 2, bad_bed: 4 },
    bearVerdict: '位置無敵，但這一帶的設計感精品旅館幾乎清一色是11-13㎡的「拍照很美、住起來像盒子」類型。大阪必買的藥妝和食品戰利品回來根本沒地方放，只能堆在床上。半夜警車臨檢、路人唱歌的聲音完全擋不住，建議對隔音有要求的人選高樓層並確認有隔音窗。',
    defenseAdvice: '同區旅館請選標示「deluxe double」或房間20㎡以上的類型，或往堀江、美國村方向走，同樣生活機能好但安靜很多。',
    agodaCityId: 9590,
    bookingArea: '心斎橋 大阪',
  },
  {
    name: '新大阪站周邊',
    city: '大阪',
    tagline: '交通天堂，觀光沙漠',
    painScores: { luggage: 2, walking: 1, no_food: 4, noisy: 2, elder_trap: 1, rain_collapse: 1, female_stress: 1, bad_bed: 2 },
    bearVerdict: '搭新幹線來回京都、神戶、廣島確實超方便，房間也比市中心大。但一到晚上這裡就是標準的辦公商務區——沒有大阪的熱鬧、沒有居酒屋街、找個拉麵店要走15分鐘。如果你來大阪是為了體驗那種浮誇的夜生活和宵夜文化，住這裡你每天晚上都要搭車進去再搭車回來。',
    defenseAdvice: '純商務出差或以跨城市移動為主的行程選這區完全正確。但觀光為主的旅客請住難波或梅田，新幹線搭JR幾站就到。',
    agodaCityId: 9590,
    bookingArea: '新大阪',
  },
  // ── 京都 ───────────────────────────────────────────────────────────
  {
    name: '祇園四条/河原町周邊',
    city: '京都',
    tagline: '最熱門的地址，行李搬運是場石板路惡夢',
    painScores: { luggage: 5, walking: 3, no_food: 3, noisy: 3, elder_trap: 5, rain_collapse: 4, female_stress: 1, bad_bed: 4 },
    bearVerdict: '祇園的石板小巷走起來美翻，但拖著29吋行李箱在石板路上走10分鐘你就會開始懷疑人生。這一帶的町家改建旅館普遍沒有電梯，房間日式榻榻米雖然有特色但鋪位窄小，翻身都要小心。晚上8點後餐廳陸續關門，找宵夜要走到四条通才有選擇。',
    defenseAdvice: '選飯店前確認「有電梯」和「行李箱可在室內平放」，或直接選四条通正面的現代商務旅館，放棄町家體驗換取行動便利。帶長輩或推車者請選烏丸御池以北的區域。',
    agodaCityId: 1784,
    bookingArea: '祇園 京都',
  },
  {
    name: '嵐山渡月橋周邊',
    city: '京都',
    tagline: '景色絕美，但爬坡加塞車讓你崩潰',
    painScores: { luggage: 2, walking: 4, no_food: 5, noisy: 1, elder_trap: 4, rain_collapse: 3, female_stress: 1, bad_bed: 1 },
    bearVerdict: '嵐山的旅館空間普遍比市區大很多，安靜度也是京都第一。但觀光客下午4點散去後這裡就是個空城——晚上找東西吃幾乎不可能，超商也要走遠。前往市區的電車班次有限，尖峰時段人擠人，雨天的山路濕滑加上觀光人潮讓行動大打折扣。',
    defenseAdvice: '嵐山適合「以嵐山為主、其他景點為輔」的慢活行程，不適合以京都市區為主每天來回的玩法。訂房請確認離嵐山站或嵐電站步行5分鐘內且為平路，並自備零食備用。',
    agodaCityId: 1784,
    bookingArea: '嵐山 京都',
  },
  // ── 首爾 ───────────────────────────────────────────────────────────
  {
    name: '明洞核心區',
    city: '首爾',
    tagline: '藥妝唾手可得，但房間小到讓你站著換衣服',
    painScores: { luggage: 5, walking: 2, no_food: 1, noisy: 4, elder_trap: 3, rain_collapse: 2, female_stress: 1, bad_bed: 4 },
    bearVerdict: '明洞的地理位置無可挑剔，但這區商務旅館房間15㎡是標配，兩個人加兩個行李箱打開就是在玩俄羅斯方塊。韓國爆買文化讓這問題加倍嚴重——第一天住進去覺得還好，第三天購物袋堆滿地板你就懂了。部分老旅館電梯只容一個行李箱，兩個人要分開上下樓。',
    defenseAdvice: '明洞住宿請選標示「Standard Double 20㎡以上」或直接選弘大、麻浦區域，地鐵15分鐘可達明洞但空間大一倍。',
    agodaCityId: 14690,
    bookingArea: '明洞 서울',
  },
  {
    name: '弘大入口站周邊',
    city: '首爾',
    tagline: '年輕人的天堂，週末夜晚的噪音地獄',
    painScores: { luggage: 2, walking: 2, no_food: 1, noisy: 5, elder_trap: 2, rain_collapse: 2, female_stress: 2, bad_bed: 2 },
    bearVerdict: '弘大空間感比明洞好很多，食物和購物也精彩。但週五週六晚上10點到凌晨3點，這裡是首爾最吵的區域之一，街頭表演、夜店人潮、外送機車聲此起彼落。如果你是輕眠族或帶小孩，週末弘大住宿請直接升等到有隔音認證的旅館或往合井站方向移動。',
    defenseAdvice: '弘大住宿指定「高樓層＋隔音窗」，或選擇主要街道後方的巷弄旅館，遠離街頭表演區至少150公尺。平日住宿問題不大，週末要特別注意。',
    agodaCityId: 14690,
    bookingArea: '弘大 서울',
  },
  {
    name: '東大門周邊',
    city: '首爾',
    tagline: '24小時購物天堂，但凌晨的卸貨聲讓你失眠',
    painScores: { luggage: 3, walking: 2, no_food: 1, noisy: 5, elder_trap: 3, rain_collapse: 2, female_stress: 2, bad_bed: 3 },
    bearVerdict: '東大門設計廣場周邊確實24小時都有東西吃，但這裡是首爾最大的批發市場區，凌晨2點到早上6點是卸貨高峰期，卡車進出、搬運工具碰撞聲不絕於耳。住在批發市場棟正面的旅館幾乎都有這個問題，要睡好覺請選背面或距離市場100公尺以上的位置。',
    defenseAdvice: '東大門住宿選「DDP（設計廣場）背面」或「新設洞站方向」，遠離批發市場正面街道。確認旅館有雙層隔音窗或評論提到「安靜」字眼。',
    agodaCityId: 14690,
    bookingArea: '東大門 서울',
  },
  // ── 曼谷 ───────────────────────────────────────────────────────────
  {
    name: '考山路周邊',
    city: '曼谷',
    tagline: '背包客聖地，但台灣人住這裡通常會後悔',
    painScores: { luggage: 4, walking: 3, no_food: 1, noisy: 5, elder_trap: 4, rain_collapse: 4, female_stress: 3, bad_bed: 4 },
    bearVerdict: '考山路是西方背包客文化的產物，跟台灣人的旅遊習慣格格不入。旅館普遍是10-14㎡的小房間、薄牆壁、派對聲到凌晨4點。這裡沒有BTS或MRT，去任何景點都要打車，雨季積水嚴重，Grab在這一帶收費也比較貴。除非你是來參加派對，否則沒有任何理由住這裡。',
    defenseAdvice: '完全迴避考山路作為住宿選擇。同樣的預算選素坤逸或是Ari站周邊，有BTS直達、安全、乾淨、選擇多。',
    agodaCityId: 9395,
    bookingArea: 'Khao San Road Bangkok',
  },
  {
    name: '素坤逸Nana/Asok站周邊',
    city: '曼谷',
    tagline: '交通超方便，但某些巷子不適合家庭旅遊',
    painScores: { luggage: 2, walking: 3, no_food: 1, noisy: 3, elder_trap: 3, rain_collapse: 4, female_stress: 3, bad_bed: 1 },
    bearVerdict: 'Asok站交通無敵，但Nana站周邊的Soi 3-5一帶是曼谷著名的夜生活區，氣氛複雜。比價網站列出的某些「超划算四星旅館」就坐落在這些巷子裡，白天看評論沒問題，晚上走回去的路段對家庭旅客和女性獨旅者不太友善。雨季地下道積水問題嚴重，推行李箱要有心理準備。',
    defenseAdvice: '素坤逸選Phromphong（BTS 33）或Thong Lo（BTS 55）站，遠離Nana站Soi 3-5範圍，這兩站周邊有大型商場、超市、安靜的咖啡街，帶家人完全沒問題。',
    agodaCityId: 9395,
    bookingArea: 'Sukhumvit Bangkok',
  },
  {
    name: '暹羅Siam周邊',
    city: '曼谷',
    tagline: '購物最爽，但節假日人潮讓你寸步難行',
    painScores: { luggage: 3, walking: 2, no_food: 2, noisy: 3, elder_trap: 2, rain_collapse: 1, female_stress: 1, bad_bed: 2 },
    bearVerdict: 'Siam是曼谷最安全、最方便的區域之一，但旅館定價普遍偏高，同樣的錢在Phromphong可以住到更好的房間。週末和泰國節假日暹羅廣場人潮誇張，BTS站擠到要排隊等三班車，如果你有搭下午班機的壓力，那天早上的移動會非常痛苦。',
    defenseAdvice: 'Siam住宿性價比不高，建議只在預算充裕時選擇。一般旅客選Phromphong或On Nut站，同樣BTS沿線但價格便宜30-50%。',
    agodaCityId: 9395,
    bookingArea: 'Siam Bangkok',
  },
  // ── 新加坡 ─────────────────────────────────────────────────────────
  {
    name: '牛車水/克拉碼頭周邊',
    city: '新加坡',
    tagline: '觀光客最愛，但夜間噪音和房間大小讓你傻眼',
    painScores: { luggage: 4, walking: 3, no_food: 1, noisy: 4, elder_trap: 2, rain_collapse: 2, female_stress: 1, bad_bed: 4 },
    bearVerdict: '克拉碼頭的夜生活很精彩，但週末到凌晨2點都是派對人潮，河邊旅館隔音普遍不理想。牛車水的老店屋改建旅館很有特色，但房間普遍偏小，部分沒有窗戶或窗戶對著走廊。新加坡的住宿本來就貴，在這區花同樣的錢在其他區可以住到明顯更好的房間。',
    defenseAdvice: '牛車水住宿選有自然採光窗戶、房間標示20㎡以上的旅館。如果預算有限，選Lavender或Kallang站周邊，MRT幾站可達市中心但便宜30%以上。',
    agodaCityId: 4064,
    bookingArea: 'Chinatown Singapore',
  },
  {
    name: '烏節路周邊',
    city: '新加坡',
    tagline: '新加坡最貴地段，但你花的錢大部分是在付地段費',
    painScores: { luggage: 2, walking: 1, no_food: 2, noisy: 2, elder_trap: 1, rain_collapse: 1, female_stress: 1, bad_bed: 1 },
    bearVerdict: '烏節路的硬體條件幾乎無可挑剔，但這裡的旅館定價是新加坡最高的區域，同樣的錢在其他城市可以住到頂級五星。如果你的預算有限，住烏節路純粹是在為地址買單。這區的宵夜選擇其實不如想像中豐富，超市和小吃反而要走一段路。',
    defenseAdvice: '烏節路適合預算充裕、以購物為主的行程。一般觀光旅客選Bugis或Bencoolen街周邊，MRT兩站可達烏節路，但住宿費用省下40-60%。',
    agodaCityId: 4064,
    bookingArea: 'Orchard Road Singapore',
  },
];

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

function buildAgodaUrl(area: AreaProfile, checkIn: string, checkOut: string, rooms: number, adults: number, selectedPains: string[]): string {
  let sort = 'popularity';
  let reviewScore = '';
  if (selectedPains.includes('noisy')) {
    sort = 'rating_desc';
    reviewScore = '9';
  } else if (selectedPains.includes('luggage') || selectedPains.includes('bad_bed') || selectedPains.includes('female_stress')) {
    reviewScore = '8';
    sort = 'rating_desc';
  } else if (selectedPains.length > 0 && !selectedPains.includes('elder_trap')) {
    sort = 'rating_desc';
    reviewScore = '8';
  }
  const reviewParam = reviewScore ? `&hotelReviewScore=${reviewScore}` : '';
  const base = `https://www.agoda.com/zh-tw/search?city=${area.agodaCityId}&checkIn=${checkIn}&checkOut=${checkOut}&rooms=${rooms}&adults=${adults}&locale=zh-tw&currency=TWD&cid=${AGODA_CID}&sort=${sort}${reviewParam}`;
  return `${AGODA_TRACKING}?t=${encodeURIComponent(encodeURIComponent(base))}`;
}

function buildBookingUrl(area: AreaProfile, checkIn: string, checkOut: string, rooms: number, adults: number, selectedPains: string[]): string {
  const cityEn = BOOKING_CITY_EN[area.city] || area.city;
  const qualityPains = ['noisy', 'luggage', 'bad_bed', 'female_stress', 'no_food'];
  const elderPains   = ['elder_trap', 'rain_collapse', 'walking'];
  let reviewScore = '80';
  if (selectedPains.some(p => qualityPains.includes(p))) {
    reviewScore = '90';
  } else if (selectedPains.some(p => elderPains.includes(p))) {
    reviewScore = '80';
  }
  const nflt = selectedPains.length > 0 ? `&nflt=review_score%3D${reviewScore}` : '';
  return `https://www.booking.com/searchresults.zh-tw.html` +
    `?aid=${BOOKING_AID}` +
    `&ss=${encodeURIComponent(cityEn)}` +
    `&checkin=${checkIn}&checkout=${checkOut}` +
    `&group_adults=${adults}&no_rooms=${rooms}${nflt}`;
}

function addDays(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

type ResultArea = AreaProfile & { userPainTotal: number };

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

  const selectedCity = CITY_OPTIONS.find(c => c.value === cityName)!;

  function togglePain(id: string) {
    setSelectedPains(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    );
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

    const cityAreas = COMPREHENSIVE_PAIN_MAP.filter(a => a.city === cityName);
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

  return (
    <div className="min-h-screen bg-stone-50 text-stone-800 font-sans pb-24">

      {/* Hero */}
      <div className="bg-gradient-to-b from-stone-900 to-stone-800 text-white px-4 pt-12 pb-10 text-center">
        <div className="max-w-2xl mx-auto">
          <div className="inline-block bg-rose-600 text-white text-xs font-black px-3 py-1 rounded-full mb-4 tracking-wider uppercase">
            ⚠️ 台灣人出國避痛大腦 v2.1
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            🐻 不踩雷，比便宜更重要。
          </h1>
          <p className="text-stone-300 text-base leading-relaxed max-w-xl mx-auto">
            設定行程、勾選最怕的痛苦，兩隻熊幫你診斷哪些區域要遠離。
          </p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 -mt-6">

        {/* 行程設定 */}
        <div className="bg-white border-2 border-stone-900 rounded-2xl p-6 shadow-xl mb-6">
          <h2 className="text-xs font-black text-stone-400 uppercase tracking-widest mb-4">行程設定</h2>

          <div className="grid grid-cols-3 gap-3 mb-3">
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">目的地</label>
              <select
                value={cityName}
                onChange={e => { setCityName(e.target.value); setHasSearched(false); }}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white"
              >
                {CITY_OPTIONS.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">房間數</label>
              <select
                value={rooms}
                onChange={e => setRooms(Number(e.target.value))}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white"
              >
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n} 間</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">入住人數</label>
              <select
                value={adults}
                onChange={e => setAdults(Number(e.target.value))}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none bg-white"
              >
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} 人</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">入住日期</label>
              <input
                type="date"
                value={checkIn}
                min={addDays(0)}
                onChange={e => handleCheckIn(e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-black text-stone-500 uppercase tracking-wider block mb-1.5">退房日期</label>
              <input
                type="date"
                value={checkOut}
                min={checkIn}
                onChange={e => setCheckOut(e.target.value)}
                className="w-full border-2 border-stone-200 rounded-xl px-3 py-2.5 text-sm font-bold text-stone-800 focus:border-rose-400 focus:outline-none"
              />
            </div>
          </div>

          <p className="text-xs text-stone-400 mt-3 text-right">
            {cityName} · {nights} 晚 · {rooms} 間 · {adults} 人
          </p>
        </div>

        {/* 痛苦選擇面板 */}
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
                <button
                  key={pain.id}
                  onClick={() => togglePain(pain.id)}
                  className={`border-2 rounded-xl p-4 text-left transition-all flex items-start gap-3 select-none ${
                    checked
                      ? 'border-rose-600 bg-rose-50 shadow-sm'
                      : 'border-stone-200 hover:border-stone-400 bg-white'
                  }`}
                >
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
              已選 {selectedPains.length} 項痛點 · 分析 {cityName} {COMPREHENSIVE_PAIN_MAP.filter(a => a.city === cityName).length} 個熱門住宿區
            </p>
          )}

          <button
            onClick={handleCalculate}
            className="w-full bg-rose-600 hover:bg-rose-700 active:scale-[.99] text-white font-black py-4 px-6 rounded-xl transition-all shadow-md text-lg flex items-center justify-center gap-2"
          >
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

            {/* 鋼鐵無痛人 Banner */}
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
                <div
                  key={area.name}
                  className={`bg-white rounded-2xl shadow-sm relative overflow-hidden border-2 ${
                    isTop ? 'border-rose-500 shadow-rose-100' : 'border-stone-200'
                  }`}
                >
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
                        <div
                          className={`h-full rounded-full transition-all ${
                            dangerPct >= 80 ? 'bg-red-500' :
                            dangerPct >= 60 ? 'bg-orange-400' : 'bg-yellow-400'
                          }`}
                          style={{ width: `${dangerPct}%` }}
                        />
                      </div>
                    </div>

                    {/* 痛苦明細格子 */}
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 mb-4">
                      {PAIN_LIST.map(p => {
                        const score = area.painScores[p.id as PainKey];
                        const highlight = isIronUser || selectedPains.includes(p.id);
                        return (
                          <div
                            key={p.id}
                            className={`rounded-lg p-1.5 text-center transition-all ${
                              highlight ? 'ring-2 ring-stone-900 ring-offset-1' : 'opacity-40'
                            } ${painColor(score)}`}
                            title={`${p.label}：${painLabel(score)}`}
                          >
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
                      <a
                        href={buildAgodaUrl(area, checkIn, checkOut, rooms, adults, selectedPains)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white text-sm font-bold rounded-xl transition-colors"
                      >
                        🔍 搜尋安全替代區域（Agoda）
                      </a>
                      <a
                        href={buildBookingUrl(area, checkIn, checkOut, rooms, adults, selectedPains)}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors"
                      >
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
