export interface AvoidZone {
  city: string
  cityEn: string
  agodaCityId: number
  zone: string
  tagline: string
  scores: {
    luggage: number
    walking: number
    lateFood: number
    noise: number
    elderly: number
    rain: number
    female: number
    bed: number
  }
  bearVerdict: string
  defense: string
}

export const avoidData: AvoidZone[] = [
  // 東京
  {
    city: '東京', cityEn: 'Tokyo', agodaCityId: 5085,
    zone: '新宿歌舞伎町周邊',
    tagline: '交通最方便，但夜晚帶家人是場災難',
    scores: { luggage:4, walking:5, lateFood:1, noise:5, elderly:3, rain:5, female:4, bed:4 },
    bearVerdict: '新宿站是全日本最大的迷宮，官網寫「走路3分鐘」是不帶行李、不迷路、走特戰速度的結果。歌舞伎町晚上滿街是案內人和喝醉的外國人，帶長輩或小孩走這段會非常後悔。預算型商務旅館房間普遍12-14㎡，兩個人加兩個行李箱，根本沒有轉身空間。',
    defense: '指定西口或南口徒步5分鐘內、樓層在4樓以上、房間標示16㎡以上的旅館。或直接往西新宿移動，價格差不多但安靜很多。'
  },
  {
    city: '東京', cityEn: 'Tokyo', agodaCityId: 5085,
    zone: '池袋北口周邊',
    tagline: '便宜陷阱，換個出口世界大不同',
    scores: { luggage:3, walking:2, lateFood:1, noise:4, elderly:2, rain:3, female:4, bed:3 },
    bearVerdict: '池袋東口是陽光城、西口是百貨公司，但「北口」是著名的無國界混亂區。很多比價網站列出的超便宜旅館就在這一帶，省了500元台幣卻換來每晚走夜路的不安。',
    defense: '池袋住宿請指定「東口徒步5分鐘內」或明確標示「近太陽城」，多花NT$300-500絕對值得。女性獨旅強烈建議避開北口所有旅館。'
  },
  {
    city: '東京', cityEn: 'Tokyo', agodaCityId: 5085,
    zone: '淺草藏前老街區',
    tagline: '江戶風情美，但晚上8點後只剩你和便利商店',
    scores: { luggage:3, walking:2, lateFood:5, noise:2, elderly:5, rain:2, female:1, bed:2 },
    bearVerdict: '淺草白天非常美，但這區是東京最早關店的觀光區之一。晚上8點後絕大多數餐廳收攤。淺草線部分老舊車站出口完全沒有電梯，29吋行李箱要爬三層樓梯。',
    defense: '選飯店時確認最近地鐵出口有無電梯，並確認飯店附近有便利商店。宵夜愛好者請改住上野或秋葉原一帶。'
  },
  {
    city: '東京', cityEn: 'Tokyo', agodaCityId: 5085,
    zone: '上野阿美橫丁周邊',
    tagline: '超鬧市場旁，白天熱鬧夜晚吵到睡不著',
    scores: { luggage:4, walking:1, lateFood:2, noise:5, elderly:2, rain:1, female:2, bed:4 },
    bearVerdict: '上野的交通無可挑剔，但阿美橫丁市場一帶的旅館隔音是東京最差之一，早上6點市場就開始搬貨卸貨，你的睡眠從此不完整。',
    defense: '上野住宿請選地圖上遠離阿美橫丁至少200公尺、標示有雙層隔音窗的旅館。或往北走5分鐘選日暮里，同樣方便但便宜又安靜。'
  },
  // 大阪
  {
    city: '大阪', cityEn: 'Osaka', agodaCityId: 9590,
    zone: '新今宮動物園前',
    tagline: '全日本最便宜，但代價你要想清楚',
    scores: { luggage:4, walking:2, lateFood:2, noise:4, elderly:3, rain:2, female:5, bed:4 },
    bearVerdict: 'NT$600-800的單人房看起來CP值極高，但這裡緊鄰大阪著名的「愛鄰地區」，是日本最密集的遊民聚居區之一。女性獨旅請完全迴避。',
    defense: '同樣的錢往北移到難波或日本橋，多花NT$300-500可以住到完全不同等級的環境。'
  },
  {
    city: '大阪', cityEn: 'Osaka', agodaCityId: 9590,
    zone: '心齋橋道頓堀核心區',
    tagline: '下樓就是章魚燒，但你的耳朵和行李箱都會哭',
    scores: { luggage:5, walking:1, lateFood:1, noise:5, elderly:2, rain:1, female:2, bed:4 },
    bearVerdict: '這一帶的設計感精品旅館幾乎清一色是11-13㎡的「拍照很美、住起來像盒子」類型。大阪必買的藥妝和食品戰利品回來根本沒地方放。半夜警車臨檢、路人唱歌的聲音完全擋不住。',
    defense: '同區旅館請選標示「deluxe double」或房間20㎡以上的類型，或往堀江、美國村方向走，同樣生活機能好但安靜很多。'
  },
  {
    city: '大阪', cityEn: 'Osaka', agodaCityId: 9590,
    zone: '新大阪站周邊',
    tagline: '商務客的天堂，美食家的荒漠',
    scores: { luggage:2, walking:1, lateFood:4, noise:2, elderly:1, rain:1, female:1, bed:2 },
    bearVerdict: '這裡一到晚上就是死寂的辦公商務區，完全沒有大阪那種熱情、浮誇的夜生活。如果你不去其他城市，只是純大阪玩，住這裡等於每天晚上提早進入退休生活。',
    defense: '觀光客選難波或梅田，新幹線搭JR幾站就到新大阪。'
  },
  // 京都
  {
    city: '京都', cityEn: 'Kyoto', agodaCityId: 1784,
    zone: '祇園四条河原町周邊',
    tagline: '最熱門的地址，行李搬運是場石板路惡夢',
    scores: { luggage:5, walking:3, lateFood:3, noise:3, elderly:5, rain:4, female:1, bed:4 },
    bearVerdict: '祇園的石板小巷走起來美翻，但拖著29吋行李箱在石板路上走10分鐘你就會開始懷疑人生。這一帶的町家改建旅館普遍沒有電梯，房間日式榻榻米雖然有特色但鋪位窄小。',
    defense: '選飯店前確認「有電梯」和「行李箱可在室內平放」，或直接選四条通正面的現代商務旅館。帶長輩或推車者請選烏丸御池以北的區域。'
  },
  {
    city: '京都', cityEn: 'Kyoto', agodaCityId: 1784,
    zone: '嵐山渡月橋周邊',
    tagline: '景色絕美，但爬坡加塞車讓你崩潰',
    scores: { luggage:2, walking:4, lateFood:5, noise:1, elderly:4, rain:3, female:1, bed:1 },
    bearVerdict: '嵐山的旅館空間普遍比市區大很多，安靜度也是京都第一。但觀光客下午4點散去後這裡就是個空城——晚上找東西吃幾乎不可能。前往市區的電車班次有限，尖峰時段人擠人。',
    defense: '嵐山適合「以嵐山為主、其他景點為輔」的慢活行程。訂房請確認離嵐山站步行5分鐘內且為平路，並自備零食備用。'
  },
  // 首爾
  {
    city: '首爾', cityEn: 'Seoul', agodaCityId: 14690,
    zone: '明洞核心區',
    tagline: '藥妝唾手可得，但房間小到讓你站著換衣服',
    scores: { luggage:5, walking:2, lateFood:1, noise:4, elderly:3, rain:2, female:1, bed:4 },
    bearVerdict: '明洞的地理位置無可挑剔，但這區商務旅館房間15㎡是標配，兩個人加兩個行李箱打開就是在玩俄羅斯方塊。部分老旅館電梯只容一個行李箱，兩個人要分開上下樓。',
    defense: '明洞住宿請選標示「Standard Double 20㎡以上」或直接選弘大、麻浦區域，地鐵15分鐘可達明洞但空間大一倍。'
  },
  {
    city: '首爾', cityEn: 'Seoul', agodaCityId: 14690,
    zone: '弘大入口站周邊',
    tagline: '年輕人的天堂，週末夜晚的噪音地獄',
    scores: { luggage:2, walking:2, lateFood:1, noise:5, elderly:2, rain:2, female:2, bed:2 },
    bearVerdict: '弘大空間感比明洞好很多，但週五週六晚上10點到凌晨3點，這裡是首爾最吵的區域之一，街頭表演、夜店人潮、外送機車聲此起彼落。',
    defense: '弘大住宿指定「高樓層＋隔音窗」，或選擇主要街道後方的巷弄旅館，遠離街頭表演區至少150公尺。'
  },
  {
    city: '首爾', cityEn: 'Seoul', agodaCityId: 14690,
    zone: '東大門周邊',
    tagline: '24小時購物天堂，凌晨的卸貨聲讓你失眠',
    scores: { luggage:3, walking:2, lateFood:1, noise:5, elderly:3, rain:2, female:2, bed:3 },
    bearVerdict: '東大門是首爾最大的批發市場區，凌晨2點到早上6點是卸貨高峰期，卡車進出、搬運工具碰撞聲不絕於耳。住在批發市場棟正面的旅館幾乎都有這個問題。',
    defense: '東大門住宿選「DDP（設計廣場）背面」或「新設洞站方向」，遠離批發市場正面街道。'
  },
  // 曼谷
  {
    city: '曼谷', cityEn: 'Bangkok', agodaCityId: 9395,
    zone: '考山路周邊',
    tagline: '背包客聖地，但台灣人住這裡通常會後悔',
    scores: { luggage:4, walking:3, lateFood:1, noise:5, elderly:4, rain:4, female:3, bed:4 },
    bearVerdict: '考山路是西方背包客文化的產物，跟台灣人的旅遊習慣格格不入。旅館普遍是10-14㎡的小房間、薄牆壁、派對聲到凌晨4點。這裡沒有BTS或MRT，去任何景點都要打車。',
    defense: '完全迴避考山路作為住宿選擇。同樣的預算選素坤逸或Ari站周邊，有BTS直達、安全、乾淨、選擇多。'
  },
  {
    city: '曼谷', cityEn: 'Bangkok', agodaCityId: 9395,
    zone: '素坤逸Nana站周邊',
    tagline: '交通超方便，但某些巷子不適合家庭旅遊',
    scores: { luggage:2, walking:3, lateFood:1, noise:3, elderly:3, rain:4, female:3, bed:1 },
    bearVerdict: 'Nana站周邊的Soi 3-5一帶是曼谷著名的夜生活區，氣氛複雜。比價網站列出的某些「超划算四星旅館」就坐落在這些巷子裡，晚上走回去的路段對家庭旅客和女性獨旅者不太友善。',
    defense: '素坤逸選Phromphong或Thong Lo站，遠離Nana站Soi 3-5範圍，這兩站周邊有大型商場、超市、安靜的咖啡街。'
  },
  // 新加坡
  {
    city: '新加坡', cityEn: 'Singapore', agodaCityId: 4064,
    zone: '牛車水克拉碼頭周邊',
    tagline: '觀光客最愛，但夜間噪音和房間大小讓你傻眼',
    scores: { luggage:4, walking:3, lateFood:1, noise:4, elderly:2, rain:2, female:1, bed:4 },
    bearVerdict: '克拉碼頭的夜生活很精彩，但週末到凌晨2點都是派對人潮。牛車水的老店屋改建旅館很有特色，但房間普遍偏小，部分沒有窗戶或窗戶對著走廊。',
    defense: '牛車水住宿選有自然採光窗戶、房間標示20㎡以上的旅館。如果預算有限，選Lavender或Kallang站周邊，MRT幾站可達市中心但便宜30%以上。'
  },
  {
    city: '新加坡', cityEn: 'Singapore', agodaCityId: 4064,
    zone: '烏節路周邊',
    tagline: '新加坡最貴地段，但你花的錢大部分是在付地段費',
    scores: { luggage:2, walking:1, lateFood:2, noise:2, elderly:1, rain:1, female:1, bed:1 },
    bearVerdict: '烏節路的硬體條件幾乎無可挑剔，但這裡的旅館定價是新加坡最高的區域，同樣的錢在其他城市可以住到頂級五星。宵夜選擇其實不如想像中豐富，超市和小吃反而要走一段路。',
    defense: '烏節路適合預算充裕、以購物為主的行程。一般觀光旅客選Bugis或Bencoolen街周邊，MRT兩站可達烏節路，但住宿費用省下40-60%。'
  },
]
