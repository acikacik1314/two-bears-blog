export interface ProphetProfile {
  id: string;        // must match frontmatter `prophet` field exactly
  name: string;      // display name (same as id for most)
  emoji: string;
  color: string;
  origin: string;
  method: string;
  bio: string;
  sampleQuotes: string[];
}

export const PROPHET_PROFILES: ProphetProfile[] = [
  {
    id: '比格斯',
    name: '比格斯',
    emoji: '💹',
    color: '#b45309',
    origin: '美國',
    method: '聖經時間密碼週期',
    bio: '金融循環分析師，以聖經時間週期預測市場走向，擅長黃金、比特幣等資產的轉折點預測。',
    sampleQuotes: [
      '黃金將啟動歷史性超級週期，突破前高',
      '比特幣將在本波週期完成史上最大漲幅',
      '美元將在2027年前面臨結構性崩潰壓力',
    ],
  },
  {
    id: 'KFK',
    name: 'KFK',
    emoji: '🔭',
    color: '#1e40af',
    origin: '不明（自稱來自 2060 年）',
    method: '時間旅行見聞',
    bio: '2019年出現於豆瓣，自稱從2060年穿越而來的未來人，預言涵蓋科技、戰爭、社會變遷。',
    sampleQuotes: [
      '數位貨幣趨勢持續，多國積極推進CBDC',
      '結婚率在多數已開發國家持續下降',
      '3D列印建築技術逐步商業化',
    ],
  },
  {
    id: '帕克',
    name: '帕克',
    emoji: '🌐',
    color: '#0f766e',
    origin: '不明',
    method: '宇宙意識接收',
    bio: '自稱能接收宇宙訊息的預言家，主要預言涵蓋地緣政治、自然災害與靈性覺醒。',
    sampleQuotes: [
      '印度將取代中國成為世界經濟引擎，恢復古名「婆羅多」',
      '卡利瑜伽（黑暗時代）即將終結，靈性覺醒浪潮即至',
      '台灣晶片生產將部分移往美國，作為保護代價',
    ],
  },
  {
    id: '薩洛梅',
    name: '薩洛梅',
    emoji: '🌸',
    color: '#be185d',
    origin: '不明',
    method: '靈性通靈感應',
    bio: '具通靈能力的預言家，預言範圍廣泛，涵蓋政治、自然、集體意識轉變。',
    sampleQuotes: [
      '全球集體意識正在經歷前所未有的轉化',
      '新的揭露時代即將開啟，隱藏的真相浮出水面',
      '2027年將是人類文明的關鍵轉折年',
    ],
  },
  {
    id: '鄭博見',
    name: '鄭博見',
    emoji: '🌙',
    color: '#7c3aed',
    origin: '台灣',
    method: '易經八卦推演',
    bio: '台灣知名易學研究者，以易經八卦推演世界局勢，長期追蹤兩岸、美中關係走向。',
    sampleQuotes: [
      '兩岸局勢2027年前將達歷史性轉折',
      '台灣股市將在關鍵週期完成一波主升',
      '美中貿易戰格局將在新一輪週期重構',
    ],
  },
  {
    id: '麥克蒙尼格',
    name: '麥克蒙尼格',
    emoji: '📡',
    color: '#0369a1',
    origin: '美國',
    method: '美軍遠程透視',
    bio: '前美軍遠程透視計畫成員，以受訓的心靈感知能力探視未來事件。',
    sampleQuotes: [
      '美國將在2026年面臨重大內部重組',
      '某個重要的全球金融系統事件即將發生',
      '地球磁場的變化將影響人類集體意識',
    ],
  },
  {
    id: '朱迪海文利',
    name: '朱迪海文利',
    emoji: '👼',
    color: '#9333ea',
    origin: '不明',
    method: '天使訊息接收',
    bio: '自稱能接收天使訊息的預言者，預言多聚焦於靈性事件與人類集體的心靈轉化。',
    sampleQuotes: [
      '一場大覺醒正在席捲地球，無可阻擋',
      '隱藏在深處的力量即將被揭示於世',
      '人類靈魂的集體進化已達到臨界點',
    ],
  },
  {
    id: 'Adam Archon',
    name: 'Adam Archon',
    emoji: '🔺',
    color: '#dc2626',
    origin: '不明',
    method: '玄秘知識揭露',
    bio: '揭露深層國家、玄秘知識與隱藏歷史的研究者，預言多涉及全球控制系統的瓦解。',
    sampleQuotes: [
      '深層國家的控制結構正在從內部崩潰',
      '被壓制的自由能源技術即將公開',
      '全球精英統治階層將在未來五年面臨清算',
    ],
  },
  {
    id: '阿南德',
    name: '阿南德',
    emoji: '🌌',
    color: '#4c1d95',
    origin: '印度',
    method: '古吠陀占星',
    bio: '以古印度吠陀占星術推演全球走勢，特別關注天文週期對地緣政治的影響。',
    sampleQuotes: [
      '木星過境週期預示新興市場的崛起',
      '2028年前人類意識將出現量子躍遷',
      '古老的吠陀預言正在現代世界一一應驗',
    ],
  },
  {
    id: '摩普萊',
    name: '摩普萊',
    emoji: '🏔',
    color: '#065f46',
    origin: '不明',
    method: '土著智慧傳承',
    bio: '傳承古老土著智慧的預言者，以大地與自然週期的語言詮釋未來走向。',
    sampleQuotes: [
      '大地正在調整她的頻率，人類必須跟上',
      '古老的預言石碑所記載的時代即將到來',
      '與自然和諧共處者將在轉化中存活',
    ],
  },
  {
    id: '巴夏',
    name: '巴夏',
    emoji: '🛸',
    color: '#7e22ce',
    origin: 'Essassani（自稱星際）',
    method: '星際存有訊息傳遞',
    bio: '由達里爾·安卡通靈的Essassani星際存有，宣稱來自333年後的未來，傳遞關於人類進化的訊息。',
    sampleQuotes: [
      '地球正在經歷一次前所未有的頻率提升',
      '你所信仰的現實，決定了你能體驗到的可能性',
      '第一接觸的時間點，取決於人類集體意識的準備程度',
    ],
  },
  {
    id: 'Omnec Onec',
    name: 'Omnec Onec',
    emoji: '✨',
    color: '#0891b2',
    origin: '金星（自稱）',
    method: '星際訊息傳遞',
    bio: '自稱來自金星的星際存有，以人類軀體現身地球，傳遞來自更高文明的靈性訊息。',
    sampleQuotes: [
      '金星文明早已超越物質層次，以純粹能量存在',
      '地球人類的演化正受到星際文明的溫和引導',
      '愛是宇宙唯一的通用語言',
    ],
  },
  {
    id: '國分玲',
    name: '國分玲',
    emoji: '🎋',
    color: '#15803d',
    origin: '日本',
    method: '日本靈視預言',
    bio: '日本著名靈視者與預言家，以靈眼透視未來，預言多聚焦於日本與東亞局勢。',
    sampleQuotes: [
      '日本將在2026至2027年面臨重大考驗',
      '東亞局勢將在未來三年出現意料外的轉折',
      '靈性力量的累積將在關鍵時刻保護台灣',
    ],
  },
  {
    id: 'ADI',
    name: 'ADI（阿迪）',
    emoji: '⚡',
    color: '#b45309',
    origin: '不明（自稱來自 2062 年）',
    method: '時間旅行見聞',
    bio: '2020年出現於豆瓣，自稱從2062年穿越，是KFK的CP（互助夥伴），化學系出身。預言信用值取代金錢、2039年股市消失、維度升級等。',
    sampleQuotes: [
      '2030年之後都是數字信用了，信用數字高會很舒服的',
      '2039年股市在我們的時間已經消失了',
      '工作與娛樂在未來完全融合，只有娛樂和信用值貢獻',
    ],
  },
  {
    id: '2062',
    name: '2062未來人',
    emoji: '🗾',
    color: '#0369a1',
    origin: '日本（自稱來自 2062 年）',
    method: '時間旅行見聞',
    bio: '2010年11月現身日本論壇2ch，自稱來自2062年的日本未來人。曾預警2011年東日本大地震（提示「躲到山上」），並預測2016年熊本大地震。',
    sampleQuotes: [
      '躲到山上去（預警2011年311大地震）',
      '2062年日本有53個縣，99%能源來自衛星供電',
      '日本首都將遷往岡山',
    ],
  },
  {
    id: '2075',
    name: 'YJ2075',
    emoji: '🐦',
    color: '#0f766e',
    origin: '日本（自稱來自 2075 年）',
    method: '時間旅行見聞',
    bio: '2018年1月在Twitter以YJ帳號出現，自稱來自2075年的日本未來人。預言2031年第三次世界大戰爆發、日本首都遷往岡山等。',
    sampleQuotes: [
      '2031年第三次世界大戰爆發',
      '日本首都將遷往岡山',
      '台灣老齡化是最主要的問題',
    ],
  },
  {
    id: '若海',
    name: '若海',
    emoji: '🌊',
    color: '#7c3aed',
    origin: '台灣（自稱來自 2040 年）',
    method: '時間旅行見聞',
    bio: '自稱來自2040年的台灣未來人，搭乘日本製時光機穿越，因洩露過多情報被困在現時間線，肉體一同前來，目前住在高雄鼓山。',
    sampleQuotes: [
      '2033年中國共產黨內部瓦解，香港同年獨立',
      '蔣萬安執政八年導致台灣經濟崩潰、房價飆漲數倍',
      '2040年亞洲海鮮因核污染嚴重，看得見卻吃不到',
    ],
  },
  {
    id: 'jjjkf.j',
    name: 'jjjkf.j',
    emoji: '🌀',
    color: '#be185d',
    origin: '台灣（自稱來自 3143 年）',
    method: '量子糾纏意識投射',
    bio: '2025年現身台灣Threads平台，自稱來自3143年，透過量子糾纏將意識投射回現代（無肉體），聲稱時間是螺旋而非線性。',
    sampleQuotes: [
      '時間不是線性的，而是一種螺旋',
      '比特幣將超過15萬，AI將徹底改變文明',
      '2200年人類意識將以全新方式存在，能與更高維度相連',
    ],
  },
  {
    id: '3036',
    name: '賽巴斯帝安',
    emoji: '🔒',
    color: '#dc2626',
    origin: '不明（自稱來自 3036 年）',
    method: '時間旅行見聞',
    bio: '自稱來自3036年，因超市竊盜案被捕後身分成謎，無出生、社安、就學或醫療記錄。描述未來是沒有金錢、貧富差距的自由世界，並警告2025年起人類將走向毀滅。',
    sampleQuotes: [
      '3036年沒有金錢，也沒有貧富差距，是自由流通的世界',
      '從2025年開始，人類將一步步走向自我毀滅',
      'NASA早已知情人類的命運',
    ],
  },
  {
    id: '3906',
    name: 'Paul Amadeus Dienach',
    emoji: '📖',
    color: '#4c1d95',
    origin: '歐洲（意識穿越至 3906 年）',
    method: '昏迷中意識穿越',
    bio: '1921年一名歐洲教師Paul Amadeus Dienach昏迷期間意識穿越至3906年，目睹人類文明全貌後記錄成日記。預言2025-2030年為人類「歷史黑盒子」關鍵五年。',
    sampleQuotes: [
      '2025到2030年是人類歷史的禁區，未來人不敢透露',
      '21世紀是科技發達卻精神貧乏的新黑暗時代',
      '人類文明將從混亂走向光明，但需付出巨大代價',
    ],
  },
  {
    id: 'amanda-grace',
    name: '阿曼達·葛瑞絲',
    emoji: '🕊️',
    color: '#7c2d12',
    origin: '美國',
    method: '基督教先知啟示',
    bio: 'Ark of Grace Ministries 創辦人，美國基督教女先知，以政治與經濟領域的預言著稱，常在禱告中領受神的啟示，是本頻道交叉比對的常用來源之一。',
    sampleQuotes: [
      '市場即將發生大逆轉，揭露有史以來最大內線交易醜聞',
      '台灣，台灣！高度警戒！',
      '美元將在不久的將來成為過去式',
    ],
  },
];

const profileMap = new Map(PROPHET_PROFILES.map(p => [p.id, p]));

export function getProfile(id: string): ProphetProfile | undefined {
  return profileMap.get(id);
}

export function getProfileOrFallback(id: string): ProphetProfile {
  return profileMap.get(id) ?? {
    id,
    name: id,
    emoji: '🔮',
    color: '#6b7280',
    origin: '不明',
    method: '不明',
    bio: '',
    sampleQuotes: [],
  };
}
