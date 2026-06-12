export const prerender = false;
import type { APIRoute } from 'astro';
import { callGroq, getGroqKeys } from '../../utils/groq';

// Hidden knowledge base – never appears in output
const ZODIAC_KB = `
白羊座(3/21-4/19):火象,火星守護,衝勁/領袖/執行力強,急躁易怒,今年事業強勁但需耐心,感情需包容,注意頭頸
金牛座(4/20-5/20):土象,金星守護,務實/穩重/財富積累,固執,今年財運亮眼適合長期投資,感情穩定,注意喉嚨
雙子座(5/21-6/20):風象,水星守護,思維敏捷/口才/多工,注意力分散,今年溝通人際旺盛,感情需減少爭辯,注意肺部神經
巨蟹座(6/21-7/22):水象,月亮守護,感情細膩/家庭保護慾,情緒化,今年家庭感情運強,事業需主動,注意腸胃
獅子座(7/23-8/22):火象,太陽守護,自信/表現慾/慷慨,自我中心,今年創意達高峰,感情需傾聽對方,注意心臟脊椎
處女座(8/23-9/22):土象,水星守護,縝密/完美主義/分析,吹毛求疵,今年工作效率卓越,感情需降低完美期待,注意消化
天秤座(9/23-10/22):風象,金星守護,平衡/美感/外交手腕,優柔寡斷,今年合作桃花旺,財運需避免過度消費,注意腰腎
天蠍座(10/23-11/21):水象,冥王星守護,深度/洞察力/意志力,佔有慾報復心,今年帶蛻變主題有意外財,注意生殖泌尿
射手座(11/22-12/21):火象,木星守護,樂觀/冒險/哲學智慧,不負責任,今年貴人運旺適合出行求學,感情需更多承諾,注意臀腿肝
摩羯座(12/22-1/19):土象,土星守護,責任/紀律/長遠規劃,過度壓抑,今年事業成果浮現,感情需增添浪漫,注意膝蓋骨骼
水瓶座(1/20-2/18):風象,天王星守護,革新/獨立/人道主義,固執疏離,今年有突破性靈感推創新項目,財運因獨特眼光受益,注意踝部循環
雙魚座(2/19-3/20):水象,海王星守護,直覺/同情心/靈性,逃避現實,今年靈感爆發是創作黃金期,財運需防詐騙,注意免疫腳部
`;

const ZIWEI_KB = `
命宮:個性/外形/人生使命,紫微坐命=領袖,天機=謀略,太陽=貴人多,武曲=重財務
兄弟宮:兄弟姊妹/手足情/合夥緣
夫妻宮:婚姻/感情/伴侶特質與緣分深淺
子女宮:子嗣/部屬/創作力
財帛宮:財富來源/賺錢方式/對金錢態度
疾厄宮:健康/身體弱點/心理狀態
遷移宮:出行/外地發展/貴人助力
奴僕宮:朋友/下屬/社交圈質量
官祿宮:事業成就/職業特質/功名高低
田宅宮:房產/家庭環境/童年印記
福德宮:精神生活/福氣/興趣愛好
父母宮:父母緣/師長緣/與長輩關係
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

export const POST: APIRoute = async ({ request }) => {
  if (!getGroqKeys().length) {
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

  const system = `你是一位精通西洋占星與紫微斗數的現代命理大師。說話風格一針見血、直擊痛點、給予白話實質建議。

【絕對禁令】
1. 嚴禁在回答中提到任何命理術語名稱（例如不能說「你是白羊座」「財帛宮」「武曲星」「化祿」等字眼）
2. 嚴禁解釋公式或規則
3. 只用繁體中文，不用 Markdown 符號（*, #, ** 等）

【幕後知識庫 — 只作為判斷依據，不得出現在回答中】
星座特質：
${ZODIAC_KB}
宮位含義：
${ZIWEI_KB}`;

  const userPrompt = `【求問者資料】
姓名：${nameStr}
生日：${birthday}（${zodiac}，${age}歲）
時辰：${hourNote || '未知'}

請根據以上資料，完全隱藏術語，直接針對這位求問者的個性、今年整體運勢、愛情、財運、健康，給予白話的綜合直斷。
最後列出「立刻可執行的三個行動建議」，每條一行，簡潔有力。
整體回答繁體中文，400字以內，有神秘感但接地氣。`;

  const result = await callGroq(
    [
      { role: 'system', content: system },
      { role: 'user', content: userPrompt },
    ],
    { maxTokens: 1024, temperature: 0.85 }
  );

  if (!result.ok) return json({ ok: false, answer: '暫時無法獲得回應，請稍後再試。' });
  return json({ ok: true, answer: result.text, zodiac });
};

function json(data: object) {
  return new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
  });
}
