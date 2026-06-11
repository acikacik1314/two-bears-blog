import { useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const DIMENSIONS = [
  { id: 1, icon: '🔮', label: '命運軌跡',    sub: '企業基本面 × 預言時間線' },
  { id: 2, icon: '🛡️', label: '絕對防禦',    sub: '護城河框架 × 世紀危機壓力測試' },
  { id: 3, icon: '⚠️', label: '黑天鵝雷達',  sub: '風險矩陣 × 未來人警告記錄' },
  { id: 4, icon: '📣', label: '解密天機',    sub: '財報後數據 × 市場情緒解讀' },
  { id: 5, icon: '🧮', label: '估值溫度計',  sub: '多維估值 × 歷史分位觀測' },
];

const DIM_ORDINALS = ['一', '二', '三', '四', '五'];

type Phase = 'idle' | 'loading' | 'streaming' | 'done' | 'error';

interface GroundingChunk { web?: { uri: string; title?: string } }
interface GroundingMeta {
  webSearchQueries?: string[];
  groundingChunks?: GroundingChunk[];
  searchEntryPoint?: { renderedContent: string };
}

export default function OracleApp() {
  const [symbol, setSymbol]       = useState('');
  const [dimension, setDimension] = useState<number | null>(null);
  const [phase, setPhase]         = useState<Phase>('idle');
  const [text, setText]           = useState('');
  const [meta, setMeta]           = useState<GroundingMeta | null>(null);
  const [errMsg, setErrMsg]       = useState('');
  const [rptSymbol, setRptSymbol] = useState('');
  const [rptDim, setRptDim]       = useState<number | null>(null);
  const [copied, setCopied]       = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const canSubmit =
    /^[A-Za-z0-9.]{1,6}$/.test(symbol.trim()) &&
    dimension !== null &&
    phase !== 'loading' &&
    phase !== 'streaming';

  async function handleSubmit() {
    if (!canSubmit) return;
    const sym = symbol.trim().toUpperCase();
    const dim = dimension!;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setPhase('loading');
    setText('');
    setMeta(null);
    setErrMsg('');
    setRptSymbol(sym);
    setRptDim(dim);

    try {
      const res = await fetch('/api/gemini-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym, dimension: dim }),
        signal: ctrl.signal,
      });

      if (!res.body) throw new Error('no body');

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let started = false;
      let gotDone = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const jstr = line.slice(6).trim();
          if (!jstr) continue;

          try {
            const d = JSON.parse(jstr);
            if (d.error) {
              setErrMsg(d.error);
              setPhase('error');
              return;
            }
            if (d.t) {
              if (!started) { started = true; setPhase('streaming'); }
              setText(prev => prev + d.t);
            }
            if (d.done) {
              gotDone = true;
              if (d.meta) setMeta(d.meta as GroundingMeta);
              setPhase('done');
            }
          } catch { /* malformed chunk */ }
        }
      }

      if (!gotDone) setPhase('done');
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') return;
      setErrMsg('時空訊號中斷，請稍後重試');
      setPhase('error');
    }
  }

  function handleReset() {
    abortRef.current?.abort();
    setPhase('idle');
    setText('');
    setMeta(null);
    setErrMsg('');
  }

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }

  const dimLabel = DIMENSIONS.find(d => d.id === rptDim)?.label ?? '';

  return (
    <div>
      {/* ── Hero ── */}
      <div className="or-hero">
        <div className="or-hero-grid" />
        <div className="or-hero-content">
          <div className="or-eyebrow">時空因果觀測站</div>
          <h1>🔮 AI 股價 × 預言記錄<br />交叉觀測工具</h1>
          <p className="or-hero-sub">
            AI 即時連網檢索：一邊是華爾街硬核財報，一邊是網路上流傳的未來人預言記錄。
            兩條時間線疊在一起，會看到什麼？
          </p>
        </div>
      </div>

      <div className="or-main">
        {/* ── Top disclaimer ── */}
        <div className="or-disclaimer">
          ⚠️ 本頁內容由 AI 即時檢索生成，僅供娛樂與資訊參考，不構成任何投資建議。預言內容為網路公開記錄之整理，本站不對其真實性背書。投資有風險，決策請諮詢持牌專業人士。
        </div>

        {/* ── Control panel (idle / error) ── */}
        {(phase === 'idle' || phase === 'error') && (
          <div className="or-panel">
            <div className="or-panel-label">⚙ 設定觀測參數</div>

            <div className="or-input-wrap">
              <input
                className="or-input"
                value={symbol}
                onChange={e => setSymbol(e.target.value.replace(/[^A-Za-z0-9.]/g, '').slice(0, 6))}
                placeholder="請輸入欲觀測的資產符號（例如：2330、AAPL）…"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                autoCapitalize="characters"
                spellCheck={false}
              />
            </div>

            <div className="or-dims">
              {DIMENSIONS.map(d => (
                <div
                  key={d.id}
                  className={`or-dim${dimension === d.id ? ' selected' : ''}`}
                  onClick={() => setDimension(d.id)}
                  role="radio"
                  aria-checked={dimension === d.id}
                  tabIndex={0}
                  onKeyDown={e => e.key === 'Enter' && setDimension(d.id)}
                >
                  <span className="or-dim-icon">{d.icon}</span>
                  <div className="or-dim-text">
                    <h4>觀測點{DIM_ORDINALS[d.id - 1]}：{d.label}</h4>
                    <p>{d.sub}</p>
                  </div>
                </div>
              ))}
            </div>

            <button
              className="or-submit"
              onClick={handleSubmit}
              disabled={!canSubmit}
            >
              🛰️ 啟動時空觀測
            </button>
          </div>
        )}

        {/* ── Error banner ── */}
        {phase === 'error' && (
          <div className="or-error">
            <span>⚠️</span>
            <span>{errMsg || '時空訊號中斷，請稍後重試'}</span>
          </div>
        )}

        {/* ── Loading (radar) ── */}
        {phase === 'loading' && (
          <div className="or-loading">
            <div className="or-radar" aria-hidden="true">
              <div className="or-radar-c" />
              <div className="or-radar-c or-radar-c2" />
              <div className="or-radar-c or-radar-c3" />
              <div className="or-radar-sweep" />
            </div>
            <div className="or-loading-label">
              正在連接時空訊號<span className="or-dots" />
            </div>
            <div className="or-loading-hint">
              AI 正在即時檢索 {rptSymbol} 的財報資料與預言記錄…
            </div>
          </div>
        )}

        {/* ── Result (streaming / done) ── */}
        {(phase === 'streaming' || phase === 'done') && text && (
          <div className="or-result">
            <div className="or-result-head">
              <span className="or-result-sym">{rptSymbol}</span>
              <span className="or-result-badge">{dimLabel}</span>
              {phase === 'streaming' && (
                <span className="or-live-tag">⚡ 即時生成中…</span>
              )}
            </div>

            <div className="or-markdown">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {text}
              </ReactMarkdown>
              {phase === 'streaming' && <span className="or-cursor" aria-hidden="true" />}
            </div>
          </div>
        )}

        {/* ── Grounding sources ── */}
        {phase === 'done' && meta && (
          <div className="or-sources">
            <div className="or-sources-title">📡 觀測訊號來源</div>

            {(meta.groundingChunks ?? []).filter(c => c.web?.uri).length > 0 && (
              <div className="or-source-list">
                {meta.groundingChunks!
                  .filter(c => c.web?.uri)
                  .map((c, i) => (
                    <div key={i} className="or-source-item">
                      <span className="or-source-dot" aria-hidden="true">›</span>
                      <a href={c.web!.uri} target="_blank" rel="noopener noreferrer">
                        {c.web!.title ?? c.web!.uri}
                      </a>
                    </div>
                  ))}
              </div>
            )}

            {/* Google Search Grounding chips — required by Google's Terms of Service */}
            {meta.searchEntryPoint?.renderedContent && (
              <div
                className="or-search-chips"
                dangerouslySetInnerHTML={{ __html: meta.searchEntryPoint.renderedContent }}
              />
            )}
          </div>
        )}

        {/* ── Action buttons ── */}
        {(phase === 'streaming' || phase === 'done') && (
          <div className="or-actions">
            {phase === 'done' && (
              <button className="or-btn or-btn-teal" onClick={handleCopy}>
                {copied ? '✅ 已複製' : '📋 複製觀測報告'}
              </button>
            )}
            <button className="or-btn or-btn-gold" onClick={handleReset}>
              🔁 重新觀測時間線
            </button>
            <a href="/" className="or-btn or-btn-ghost">
              🐻 回兩隻熊首頁
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
