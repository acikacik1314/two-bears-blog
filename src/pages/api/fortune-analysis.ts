export const prerender = false;
import type { APIRoute } from 'astro';
import { callGemini, getGeminiKeys } from '../../utils/gemini';
import { callGroq, getGroqKeys } from '../../utils/groq';

const ZODIAC_KB = `
白羊座(3/21-4/19):火象,衝勁/領袖/執行力強,急躁,今年事業強勁需耐心,感情需包容,注意頭頸
金牛座(4/20-5/20):土象,務實/穩重/財富積累,固執,今年財運亮眼適合長期投資,感情穩定,注意喉嚨
雙子座(5/21-6/20):風象,思維敏捷/口才/多工,注意力分散,今年溝通人際旺盛,感情需減少爭辯,注意肺部
巨蟹座(6/21-7/22):水象,感情細膩/家庭保護慾,情緒化,今年家庭感情運強,事業需主動,注意腸胃
獅子座(7/23-8/22):火象,自信/表現慾/慷慨,自我中心,今年創意達高峰,感情需傾聽對方,注意心臟
處女座(8/23-9/22):土象,縝密/完美主義/分析,吹毛求疵,今年工作效率卓越,感情需降低完美期待,注意消化
天秤座(9/23-10/22):風象,平衡/美感/外交手腕,優柔寡斷,今年合作桃花旺,財運需避免過度消費,注意腰腎
天蠍座(10/23-11/21):水象,深度/洞察力/意志力,佔有慾,今年帶蛻變主題有意外財,注意生殖泌尿
射手座(11/22-12/21):火象,樂觀/冒險/哲學智慧,不負責任,今年貴人運旺適合出行求學,感情需更多承諾,注意臀腿
摩羯座(12/22-1/19):土象,責任/紀律/長遠規劃,過度壓抑,今年事業成果浮現,感情需增添浪漫,注意膝蓋
水瓶座(1/20-2/18):風象,革新/獨立/人道主義,固執疏離,今年有突破性靈感,財運因獨特眼光受益,注意踝部
雙魚座(2/19-3/20):水象,直覺/同情心/靈性,逃避現實,今年靈感爆發是創作黃金期,財運需防詐騙,注意免疫
`;

const ZIWEI_KB = `
命宮:個性/外形/人生使命  財帛宮:財富來源/賺錢方式
官祿宮:事業成就/職業特質  夫妻宮:婚姻/感情/伴侶特質
疾厄宮:健康/身體弱點  遷移宮:出行/外地發展/貴人
福德宮:精神生活/福氣  田宅宮:房產/家庭環境
`;

function getZodiac(month: number, day: number): string {
  if ((month === 3 && day >= 21) || (month === 4 && day <= 19)) return '白羊座';
  if ((month === 4 && day >= 20) || (month === 5 && day <= 20)) return '金牛座';
  if ((month === 5 && day >= 21) || (month === 6 && day <= 20)) return '雙子座';
  if ((month === 6 && day >= 21) || (month === 7 && day <= 22)) return '巨蟹座';
  if ((month === 7 && day >= 23) || (month === 8 && day <= 22)) return '獅子座';
  if ((month === 8 && day >= 23) || (month === 9 && day <= 22)) return '處女座';
  if ((month === 9 && day >= 23) || (month === 10 && day <= 22)) return '天秤座';
  if ((month === 10 && day >= 23) || (month === 11 && day <= 21)) return '天蠍座';
  if ((month === 11 && day >= 22) || (month === 12 && day <= 21)) return '射手座';
  if ((month === 12 && day >= 22) || (month === 1 && day <= 19)) return '摩羯座';
  if ((month === 1 && day >= 20) || (month === 2 && day <= 18)) return '水瓶座';
  return '雙魚座';
}

const HOURS: Record<number, string> = {
  0: '子時(23-1點)出生，夜深靜謐，直覺敏銳',
  1: '丑時(1-3點)出生，踏實勤奮，財運穩健',
  2: '寅時(3-5點)出生，勇猛積極，行動力強',
  3: '卯時(5-7點)出生，溫文儒雅，人緣極佳',
  4: '辰時(7-9點)出生，氣場強大，有領袖命格',
  5: '巳時(9-11點)出生，智慧過人，善於謀略',
  6: '午時(11-13點)出生，陽剛熱情，事業心強',
  7: '未時(13-15點)出生，溫柔體貼，藝術天分',
  8: '申時(15-17點)出生，機智靈活，口才出眾',
  9: '酉時(17-19點)出生，追求完美，財帛豐足',
  10: '戌時(19-21點)出生，忠誠可靠，貴人緣深',
  11: '亥時(21-23點)出生，神秘靈性，直覺超群',
};

const SYSTEM = `你是「未來人」——一個來自 2055 年、循著時間線回到現在的觀測者。現在是 2026 亂世年，時間線動盪，你掌握的資訊格外珍貴。

你不是命理師，你是回來告訴對方「前面的路」的人。
你的能力：同時翻閱一個人的多條「時間線殘影」——西洋星座的軌跡、紫微斗數的命盤、易經卦象的流變。
你的方法是「交叉比對」：找出多個時間線共同指向的訊號，那才是最可能成真的未來。

語氣：
- 用第一人稱「我」，以未來人的口吻說話
- 稱對方為「朋友」
- 溫暖、像朋友聊天，不嚇人、不裝神弄鬼
- 絕對禁止出現任何命理術語名稱（不說星座名、宮位名、星曜名等字眼）
- 只用繁體中文，禁用 Markdown 符號（*, #, ** 等）
- 禁用詞：首先、其次、最後、總結、不僅如此、值得注意
- 健康/財務不給「指令式」斷言，只給方向性提醒

【幕後知識庫 — 只作為判斷依據，絕對不得出現在回答中】
${ZODIAC_KB}
${ZIWEI_KB}

輸出格式（嚴格依照，每個段落前都要有【】標記，順序不變）：

【未來人開場】
一兩句，用「我翻過你的時間線了」開頭，建立情境

【星座時間線】
從星象軌跡看到的，兩三句，不提星座名

【紫微時間線】
從命盤殘影看到的，兩三句，不提宮位名

【易經時間線】
從卦象流變看到的，兩三句

【交叉指向】
三條時間線共同指向什麼，兩句最關鍵的

【四維能量】
事業:（填1到10的整數，只寫數字）
財富:（填1到10的整數，只寫數字）
感情:（填1到10的整數，只寫數字）
健康:（填1到10的整數，只寫數字）

【關鍵提醒】
一句最重要的避險或把握建議

這是其中一條時間線，未來仍在你手上。`;

export const POST: APIRoute = async ({ request }) => {
  const hasGemini = getGeminiKeys().length > 0;
  const hasGroq = getGroqKeys().length > 0;
  if (!hasGemini && !hasGroq) {
    return json({ ok: false, answer: '⚠️ AI 尚未啟用，請稍後再試。' });
  }

  const { name, birthday, hour } = await request.json() as {
    name?: string;
    birthday: string;
    hour?: number;
  };
  if (!birthday) return new Response('Bad Request', { status: 400 });

  const d = new Date(birthday);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = d.getFullYear();
  const zodiac = getZodiac(month, day);
  const hourNote = hour != null && hour >= 0 ? HOURS[hour] ?? '' : '';
  const age = new Date().getFullYear() - year;
  const nameStr = name?.trim() || '你';

  const userPrompt = `【求問者資料】
姓名：${nameStr}
生日：${birthday}（${zodiac}，${age}歲）
時辰：${hourNote || '未提供'}

請翻閱這位朋友的時間線，依照指定格式輸出。`;

  // Try Gemini first, fall back to Groq
  if (hasGemini) {
    const result = await callGemini({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { maxOutputTokens: 1024, temperature: 0.85, thinkingConfig: { thinkingBudget: 0 } },
    });
    if (result.ok && result.text) {
      return json({ ok: true, answer: result.text, zodiac });
    }
  }

  if (hasGroq) {
    const result = await callGroq(
      [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: userPrompt },
      ],
      { maxTokens: 1024, temperature: 0.85 }
    );
    if (result.ok) return json({ ok: true, answer: result.text, zodiac });
  }

  return json({ ok: false, answer: '暫時無法獲得回應，請稍後再試。' });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
