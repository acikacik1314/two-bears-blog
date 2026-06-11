export interface ProphetConfig {
  en: string;
  label: string;
  color: string;
  bg: string;
  image: string;
  icon: string;
  bio: string;
  tags: string[];
}

export const PROPHETS: Record<string, ProphetConfig> = {
  '比格斯': {
    en: 'Brandon Biggs',
    label: '比格斯',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,.12)',
    image: '/biggs-prophet.png',
    icon: '🎙',
    bio: '美國末世預言家，Last Days 頻道創辦人，精準預言川普安危、日本火山及多次全球大事',
    tags: ['基督教預言', '末世', '靈異異象'],
  },
  '帕克': {
    en: 'Craig Hamilton Parker',
    label: '帕克',
    color: '#3b82f6',
    bg: 'rgba(59,130,246,.12)',
    image: 'https://image-cdn-ak.spotifycdn.com/image/ab6772ab000015be97abe96098be58f61d240bd6',
    icon: '🔮',
    bio: '英國知名靈媒與心理測試師，準確預言多次重大政治事件，著有多本預言著作',
    tags: ['英國靈媒', '心靈感應', '政治預言'],
  },
  '麥克蒙尼格': {
    en: 'Joe McMoneagle',
    label: '麥克蒙尼格',
    color: '#10b981',
    bg: 'rgba(16,185,129,.12)',
    image: 'https://image-cdn-fa.spotifycdn.com/image/ab6772ab000015be5f38020222b3acd834a09208',
    icon: '👁',
    bio: 'CIA 星門計畫 #001 遙視員，前美軍情報官，曾精確畫出蘇聯潛艇結構並定位被綁架的將軍',
    tags: ['CIA', '遙視', '軍事情報'],
  },
  '摩普萊': {
    en: 'Morphee',
    label: '摩普萊',
    color: '#ef4444',
    bg: 'rgba(239,68,68,.12)',
    image: 'https://image-cdn-ak.spotifycdn.com/image/ab6772ab000015be8efbde8873f59858696cde97',
    icon: '⚡',
    bio: '神秘靈性感應者，以通靈方式預見全球軍事衝突與地球能量轉換',
    tags: ['靈性感應', '末日', '神秘學'],
  },
  '波蘭預言家': {
    en: 'Polish Prophet',
    label: '波蘭預言家',
    color: '#8b5cf6',
    bg: 'rgba(139,92,246,.12)',
    image: 'https://image-cdn-ak.spotifycdn.com/image/ab6772ab000015be995702a054887c23c9fe1eb1',
    icon: '⭐',
    bio: '東歐神秘預言家，預見美軍撤離波蘭、西方體制崩潰及黃金時代到來',
    tags: ['歐洲', '政治預言', '黃金時代'],
  },
  '英國神算': {
    en: 'British Psychic',
    label: '英國神算',
    color: '#06b6d4',
    bg: 'rgba(6,182,212,.12)',
    image: 'https://image-cdn-ak.spotifycdn.com/image/ab6772ab000015be00c37464272b2a19f45af82b',
    icon: '🌊',
    bio: '英國著名神秘學者，預見全球秩序大洗牌、能源革命與西方民主體制的根本轉變',
    tags: ['英國', '神秘學', '能源革命'],
  },
};

export const DEFAULT_PROPHET: ProphetConfig = {
  en: 'Future Predictor',
  label: '未來人預言家',
  color: '#7c3aed',
  bg: 'rgba(124,58,237,.12)',
  image: 'https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=160&h=160&fit=crop',
  icon: '🐻',
  bio: '兩隻熊頻道精心整理的末日預言與靈性啟示，帶你理性面對感性預言',
  tags: ['預言', '末日'],
};

export function getProphetConfig(name: string): ProphetConfig {
  return PROPHETS[name] ?? DEFAULT_PROPHET;
}

export function detectProphet(title: string): string {
  if (/比格斯|biggs|pastor/i.test(title)) return '比格斯';
  if (/帕克|parker/i.test(title)) return '帕克';
  if (/麥克蒙尼格|mcmoneagle|遙視員/i.test(title)) return '麥克蒙尼格';
  if (/摩普萊/i.test(title)) return '摩普萊';
  if (/波蘭/i.test(title)) return '波蘭預言家';
  if (/英國神算/i.test(title)) return '英國神算';
  return '';
}
