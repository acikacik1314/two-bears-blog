export interface Prediction {
  id: string
  prophetKey: string
  code: string
  hitRate: number
  text: string
  year: number
  icon: string
  deadline: string  // 'YYYY-MM-DD' 預言驗證截止日
}

// 只放 2026 年以後的「待驗證」預測
export const PREDICTIONS: Prediction[] = [
  { id: 'p001', prophetKey: '比格斯', code: 'BBG', hitRate: 71, icon: '🎙', year: 2026, deadline: '2026-12-31', text: '歐洲爆發大規模戰火，法國陷入火海' },
  { id: 'p002', prophetKey: '比格斯', code: 'BBG', hitRate: 71, icon: '🎙', year: 2026, deadline: '2026-12-31', text: '美元崩潰並被『獸的系統』數位貨幣取代' },
  { id: 'p003', prophetKey: '比格斯', code: 'BBG', hitRate: 71, icon: '🎙', year: 2026, deadline: '2026-12-31', text: '北以色列遭化學武器攻擊，造成重大傷亡' },
  { id: 'p004', prophetKey: '比格斯', code: 'BBG', hitRate: 71, icon: '🎙', year: 2026, deadline: '2026-12-31', text: '馬里布及美國西岸將發生重大地震' },
  { id: 'p005', prophetKey: '帕克',   code: 'CHP', hitRate: 60, icon: '🔮', year: 2026, deadline: '2026-12-31', text: '無限能源技術突破，解決人類資源爭奪問題' },
  { id: 'p006', prophetKey: '帕克',   code: 'CHP', hitRate: 60, icon: '🔮', year: 2027, deadline: '2027-12-31', text: '英國與加拿大最終將成為美國的一部分' },
  { id: 'p007', prophetKey: '帕克',   code: 'CHP', hitRate: 60, icon: '🔮', year: 2026, deadline: '2026-12-31', text: '南安普敦再發生年輕女性命案，點燃社會憤怒' },
  { id: 'p008', prophetKey: '麥克蒙尼格', code: 'MCM', hitRate: 100, icon: '👁', year: 2027, deadline: '2027-12-31', text: '4–5 年內某主要國家政府崩潰，引爆世界大戰' },
  { id: 'p009', prophetKey: '麥克蒙尼格', code: 'MCM', hitRate: 100, icon: '👁', year: 2026, deadline: '2026-12-31', text: '北韓在伊朗核行動後做出重大且愚蠢的軍事回應' },
  { id: 'p010', prophetKey: '麥克蒙尼格', code: 'MCM', hitRate: 100, icon: '👁', year: 2028, deadline: '2028-12-31', text: '高等文明因人類威脅啟動重置計畫，使人類退回石器時代' },
]
