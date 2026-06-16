export const prerender = false;
export const config = { maxDuration: 60 };

import type { APIRoute } from 'astro';
import { getGeminiKeys } from '../../utils/gemini';

const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

export type TravelCategory =
  | 'japan-tax'
  | 'japan-news'
  | 'thailand-visa'
  | 'thailand-news'
  | 'korea-news'
  | 'europe-news'
  | 'immigration-easy'
  | 'immigration-country'
  | 'working-holiday'
  | 'study-abroad'
  | 'study-holiday'
  | 'japan-rent-short'
  | 'japan-rent-long'
  | 'thailand-rent-short'
  | 'thailand-rent-long'
  | 'korea-rent-short'
  | 'korea-rent-long';

export interface NewsItem {
  title: string;
  content: string;
  effective_date?: string;
  country?: string;
  difficulty?: '容易' | '中等' | '困難';
  age_limit?: string;
  deadline?: string;
  unique_system?: string;
  source: string;
}

export interface TravelNewsResult {
  category: TravelCategory;
  updated_at: string;
  summary: string;
  items: NewsItem[];
  tips: string[];
}

const CATEGORY_CONFIG: Record<TravelCategory, string> = {
  'japan-tax': `你是專為台灣旅客服務的日本旅遊資訊專家。
請用 Google 搜尋「日本消費稅退稅 2025 2026 台灣旅客」「日本免稅制度最新修改」，整理目前最新的日本退稅制度。
重點：金額門檻、適用商品、制度即將調整的項目、辦理流程、信用卡退稅注意事項。
以台灣旅客角度，繁體中文。`,

  'japan-news': `你是專為台灣旅客服務的日本旅遊資訊專家。
請用 Google 搜尋「日本旅遊最新消息 2026」「日本觀光限制 入境」「Japan travel news 2026」。
重點：台灣護照免簽現況、熱門景點人潮管制、JR Pass 票價、新開幕景點、日圓匯率動態。
以台灣旅客角度，繁體中文。`,

  'thailand-visa': `你是專為台灣旅客服務的泰國旅遊資訊專家。
請用 Google 搜尋「泰國免簽 台灣 2025 2026」「Thailand visa free Taiwan」「泰國落地簽最新」。
重點：台灣護照目前免簽天數、落地簽規定、近期政策調整、入境次數限制、常見海關問題。
以台灣旅客角度，繁體中文。`,

  'thailand-news': `你是專為台灣旅客服務的泰國旅遊資訊專家。
請用 Google 搜尋「泰國旅遊最新消息 2026」「曼谷旅遊 安全」「Thailand travel news 2026」。
重點：安全狀況、景點開放、交通更新（BTS/機場捷運）、新商場餐廳、天氣季節、泰銖匯率。
以台灣旅客角度，繁體中文。`,

  'korea-news': `你是專為台灣旅客服務的韓國旅遊資訊專家。
請用 Google 搜尋「韓國旅遊 台灣 2025 2026」「K-ETA 台灣 免簽」「韓國最新旅遊資訊」「Korea travel news 2026」。
重點：台灣護照免簽現況與 K-ETA 要求、首爾/釜山景點更新、韓元匯率、交通票券、最新旅遊安全狀況。
以台灣旅客角度，繁體中文。`,

  'europe-news': `你是專為台灣旅客服務的歐洲旅遊資訊專家。
請用 Google 搜尋「歐洲申根 台灣護照 2026」「ETIAS 歐洲 台灣」「葡萄牙旅遊 台灣」「英國入境 台灣」。
重點：申根免簽現況、ETIAS 最新進度（是否已啟用）、英國 ETA 規定、葡萄牙最新旅遊資訊、各國熱門景點注意事項。
以台灣旅客角度，繁體中文。`,

  'immigration-easy': `你是台灣人海外移民顧問。
請用 Google 搜尋「台灣人移民 最簡單 2025 2026」「Taiwan immigration easy country」「台灣人移民門檻低」。
整理目前台灣護照持有人最容易取得居留權或永居的國家與方式，依難度由易到難排序。
每個項目需包含：國家、方式名稱、主要申請條件、預計時程、大概費用。
difficulty 欄位只能填：容易 / 中等 / 困難
country 欄位填國家名稱。
以台灣人角度，繁體中文。`,

  'immigration-country': `你是台灣人海外移民顧問。
請用 Google 搜尋「葡萄牙黃金簽證 台灣」「日本移民 台灣人 2026」「加拿大移民 台灣」「澳洲移民 台灣」「馬來西亞 MM2H 2026」「泰國移民 台灣」。
整理葡萄牙、日本、加拿大、澳洲、馬來西亞、泰國的移民政策最新動態。
每個項目需包含：country 欄位（國家名）、difficulty 欄位（容易/中等/困難）、主要申請方式、條件與費用。
以台灣人角度，繁體中文。`,

  'working-holiday': `你是台灣人打工度假顧問。
請用 Google 搜尋「台灣打工度假 2025 2026」「Working Holiday Taiwan 2026」「打工度假開放名額 台灣」。
整理目前台灣護照可申請的打工度假國家最新消息，包含澳洲、紐西蘭、日本、加拿大、英國、愛爾蘭、德國、法國、荷蘭、比利時、波蘭、捷克、葡萄牙、匈牙利。
每個項目需包含：country 欄位（國家）、age_limit 欄位（年齡限制，如「30歲以下」）、deadline 欄位（申請截止或開放時間，若不明填空）、名額狀況、最新消息。
以台灣人角度，繁體中文。`,

  'study-abroad': `你是台灣人留學顧問。
請用 Google 搜尋「台灣人留學 2025 2026」「日本留學 台灣」「英國留學 台灣」「澳洲留學 台灣」「Canada study permit Taiwan」。
整理日本、英國、澳洲、加拿大、美國的最新留學申請資訊。
重點：學費最新動態、申請難度變化、獎學金機會、簽證申請注意事項、留學生工作時數限制。
country 欄位填國家名稱。
以台灣人角度，繁體中文。`,

  'study-holiday': `你是台灣人數位遊牧與讀書度假顧問。
請用 Google 搜尋「數位遊牧簽 台灣 2026」「Digital Nomad Visa Taiwan」「讀書度假簽 台灣」「葡萄牙 D8 簽證」「泰國 LTR Visa」「印尼 Bali 數位遊牧」。
整理目前台灣護照可申請的數位遊牧簽、讀書度假簽、慢生活簽等方式，包含葡萄牙D8、泰國LTR、印尼特殊簽、馬來西亞DE Rantau等。
每個項目需包含：country 欄位（國家）、age_limit 欄位（若有年齡限制）、主要條件（如最低收入要求）、費用。
以台灣人角度，繁體中文。`,

  'japan-rent-short': `你是專為台灣人服務的日本租屋專家。
請用 Google 搜尋「東京短期月租 外國人 2026」「大阪 マンスリーマンション 台湾人」「日本 短期賃貸 外国人」「東京 ウィークリーマンション」。
整理日本主要城市短期租屋（マンスリーマンション、ウィークリーマンション）最新行情，重點城市：東京（新宿、池袋、渋谷、上野）、大阪（難波、梅田、心齋橋）、京都。
每個項目需包含：
- title：城市/區域名稱和房型（如「東京新宿單人套房」）
- content：詳細說明（月租行情、面積、設施、含費用細節）
- country 欄位填「日本」
- unique_system 欄位：說明日本短期租屋特殊制度（如礼金・敷金免除的マンスリー合約、保證人制度、外國人審核較嚴的注意事項、推薦平台 Sakura House、Leopalace21）
- source：資料來源
台灣人注意事項：需要在留卡或護照、保證人替代方案（保證会社）、語言障礙處理方式。
以台灣人角度，繁體中文。`,

  'japan-rent-long': `你是專為台灣人服務的日本長期租屋專家。
請用 Google 搜尋「日本長期賃貸 外国人 台湾人 2026」「外国人 賃貸 審査 日本」「敷金礼金 仲介手数料 外国人」「日本 在留カード 賃貸」。
詳細整理日本長期租屋制度，重點說明：
1. 一般賃貸：需要保證人（連帯保証人）或保證會社（保証会社），外國人常遇到審查困難。
2. 敷金（押金，通常 1-2 個月）、礼金（謝金，通常 1-2 個月，不退還）、仲介手數料。
3. 外國人友善物件：外国人可の物件、シェアハウス等選擇。
4. 在留期間限制：簽證剩餘效期影響租約審核。
每個項目需包含：
- title：制度名稱或注意重點
- content：詳細說明（費用計算、台灣人常遇困難、對策）
- unique_system 欄位：深度說明該制度核心機制和台灣人特別要注意的事項
- country 欄位填「日本」
- source：資料來源
特別提醒：退居時原狀回復費用爭議、民法改正後的敷金返還規定、推薦外國人友善仲介。
以台灣人角度，繁體中文。`,

  'thailand-rent-short': `你是專為台灣人服務的泰國租屋專家。
請用 Google 搜尋「曼谷短期月租 台灣人 2026」「Bangkok condo monthly rent foreigner」「曼谷 Sukhumvit 月租公寓」「清邁短期租屋 外國人」。
整理泰國主要城市短期租屋最新行情，重點城市：曼谷（Sukhumvit、Silom、Asok、On Nut、Thonglor）、清邁（Nimman、古城區）、芭達雅。
每個項目需包含：
- title：城市/區域名稱和房型（如「曼谷 Sukhumvit 套房」）
- content：詳細說明（月租行情含泰銖和台幣換算、面積、游泳池/健身房等設施）
- country 欄位填「泰國」
- unique_system 欄位：說明泰國短期租屋特殊制度（如不需要保證人的優點、水電費計算方式、服務公寓 vs 一般公寓差異、常用平台 DDproperty、Hipflat、Airbnb）
- source：資料來源
台灣人注意事項：外國人租屋基本不需保證人、簽約建議用英文合約、押金通常 1-2 個月、旺季價格差異。
以台灣人角度，繁體中文。`,

  'thailand-rent-long': `你是專為台灣人服務的泰國長期租屋專家。
請用 Google 搜尋「泰國長期租屋 台灣人 2026」「泰國公寓 外國人購買 租約」「Thailand lease foreigner 30 years」「曼谷長期居住 台灣人」。
詳細整理泰國長期租屋制度，重點說明：
1. 外國人不能擁有土地，但可購買公寓（Condominium）的分額不超過整棟 49%。
2. 長期租約（Leasehold）：最長 30 年，可登記在地政事務所，法律保障較完整。
3. 一般長租合約：通常 1 年起跳，押金 2 個月，可用英文合約。
4. 區域選擇：Sukhumvit 適合都市生活，Nimman（清邁）適合數位遊牧，Hua Hin 適合退休。
每個項目需包含：
- title：制度名稱或注意重點
- content：詳細說明（費用、優缺點、台灣人的適用情況）
- unique_system 欄位：深度說明該制度核心機制和台灣人特別要注意的事項
- country 欄位填「泰國」
- source：資料來源
特別提醒：長租詐騙防範、管理費（CAM Fee）計算、外國人購買公寓的外幣匯款規定（FET 文件）。
以台灣人角度，繁體中文。`,

  'korea-rent-short': `你是專為台灣人服務的韓國租屋專家。
請用 Google 搜尋「首爾短期月租 台灣人 2026」「弘大新村短期租屋 外國人」「首爾弘大 공유주택 月租」「韓國月租房 外國人申辦」。
整理首爾短期租屋（月租 월세）最新行情，重點區域：弘大、新村、梨泰院、江南、麻浦。
每個項目需包含：
- title：區域名稱和房型（如「弘大單人套房」）
- content：詳細說明（月租行情、面積、設施）
- country 欄位填「韓國」
- unique_system 欄位：說明該區域或房型的特殊租屋制度（如月租押金慣例、중개비 仲介費標準、보증금 保證金計算方式）
- source：資料來源
台灣人注意事項：外國人辦理所需文件（護照、登錄外國人）、短租平台推薦（Zigbang、Dabang、Airbnb、KV Stays）。
以台灣人角度，繁體中文。`,

  'korea-rent-long': `你是專為台灣人服務的韓國租屋專家，熟悉全稅制度。
請用 Google 搜尋「韓國全稅 Jeonse 台灣人 外國人 2026」「韓國全稅制度 설명」「全稅 外國人 ARC 辦理」「韓國長期租屋 台灣人注意」。
詳細整理韓國長期租屋制度，重點說明：
1. 全稅（전세 Jeonse）制度：押金通常為房屋市值 50-80%，租期 2 年，到期拿回全額，中間不用付月租。台灣人需要 ARC（外國人登錄）才能辦理。
2. 月租（월세）長租：押金較低但每月需付租金，外國人較容易申辦。
3. 半月租（반전세）：介於全稅與月租之間的混合制度。
每個項目需包含：
- title：制度名稱或注意重點
- content：詳細說明（適合台灣人的情況、資金需求、風險提醒）
- unique_system 欄位：深度說明該制度的核心機制和台灣人特別要注意的事項
- country 欄位填「韓國」
- source：資料來源
特別提醒：全稅詐欺案（깡통전세）風險、確認登記簿謄本（등기부등본）的重要性、需要韓國擔保人的情況。
以台灣人角度，繁體中文。`,
};

function buildPrompt(category: TravelCategory): string {
  const today = new Date().toISOString().slice(0, 10);
  return `${CATEGORY_CONFIG[category]}

今天日期：${today}。你的回覆只能是 JSON，不要任何說明文字、markdown 程式碼框或 \`\`\`json 標記。

JSON 格式（items 至少 4 筆，tips 至少 3 條）：
{
  "summary": "2-3 句話總結最重要的資訊",
  "items": [
    {
      "title": "標題（簡短有力）",
      "content": "詳細說明（100字以內）",
      "effective_date": "生效日期，若不適用填空字串",
      "country": "國家名稱，若不適用填空字串",
      "difficulty": "容易 或 中等 或 困難，若不適用填空字串",
      "age_limit": "年齡限制如「30歲以下」，若不適用填空字串",
      "deadline": "截止或開放時間，若不明填空字串",
      "source": "來源網站名稱"
    }
  ],
  "tips": ["給台灣人的實用提醒，50字以內"]
}`;
}

export const POST: APIRoute = async ({ request }) => {
  const json = (data: object, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });

  const keys = getGeminiKeys();
  if (!keys.length) {
    return json({ error: '伺服器尚未設定 GEMINI_API_KEY' }, 500);
  }

  let category: TravelCategory;
  try {
    const body = await request.json();
    const cat = String(body.category ?? '');
    if (!(cat in CATEGORY_CONFIG)) return json({ error: '無效的分類' }, 400);
    category = cat as TravelCategory;
  } catch {
    return json({ error: '請求格式錯誤' }, 400);
  }

  const prompt = buildPrompt(category);
  const shuffled = [...keys].sort(() => Math.random() - 0.5);
  let lastErr = '';
  let geminiData: any = null;

  for (const key of shuffled) {
    let res: Response;
    try {
      res = await fetch(`${GEMINI_URL}?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          tools: [{ google_search: {} }],
          generationConfig: { temperature: 0.15, maxOutputTokens: 4096, thinkingConfig: { thinkingBudget: 0 } },
        }),
        signal: AbortSignal.timeout(55000),
      });
    } catch (e) { lastErr = String(e); continue; }
    if (res.status === 429 || res.status === 401 || res.status === 403) { lastErr = `status ${res.status}`; continue; }
    if (!res.ok) { lastErr = `status ${res.status}`; continue; }
    geminiData = await res.json();
    break;
  }

  if (!geminiData) {
    console.error('[travel-news] all keys failed:', lastErr);
    return json({ error: 'AI 搜尋服務暫時無法使用，請稍後再試' }, 502);
  }

  const rawText: string = (geminiData?.candidates?.[0]?.content?.parts ?? [])
    .filter((p: any) => !p.thought)
    .map((p: any) => p.text ?? '')
    .join('').trim();

  if (!rawText) return json({ error: '未能取得資料，請稍後再試' }, 502);

  const stripped = rawText.replace(/```json\s*/g, '').replace(/```/g, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end === -1) return json({ error: '解析失敗，請稍後再試' }, 502);

  try {
    const parsed = JSON.parse(stripped.slice(start, end + 1));
    const today = new Date().toISOString().slice(0, 10);
    const result: TravelNewsResult = {
      category,
      updated_at: today,
      summary: String(parsed.summary ?? '').slice(0, 300),
      items: Array.isArray(parsed.items)
        ? parsed.items.slice(0, 12).map((item: any) => ({
            title: String(item?.title ?? '').slice(0, 80),
            content: String(item?.content ?? '').slice(0, 300),
            effective_date: item?.effective_date || undefined,
            country: item?.country || undefined,
            difficulty: ['容易', '中等', '困難'].includes(item?.difficulty) ? item.difficulty : undefined,
            age_limit: item?.age_limit || undefined,
            deadline: item?.deadline || undefined,
            unique_system: item?.unique_system ? String(item.unique_system).slice(0, 400) : undefined,
            source: String(item?.source ?? '').slice(0, 60),
          }))
        : [],
      tips: Array.isArray(parsed.tips)
        ? parsed.tips.slice(0, 6).map((t: any) => String(t).slice(0, 120))
        : [],
    };
    return json(result);
  } catch (err) {
    console.error('[travel-news] parse error:', err, rawText.slice(0, 200));
    return json({ error: '解析失敗，請稍後再試' }, 502);
  }
};
