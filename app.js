/* Recap — YouTube → conclusion-first summary.
   Pipeline: (1) Gemini reads the YouTube URL directly → timestamped transcript + metadata
             (2) transcript text → structured summary (Standard) + timeline
             (3) Short / Detailed re-summarise from the stored transcript only (no video re-processing)
   Everything is stored in this device's IndexedDB. The only network calls are to Google's Gemini API
   (with the user's own key) and YouTube thumbnails. */
'use strict';

const API = 'https://generativelanguage.googleapis.com';
const $ = id => document.getElementById(id);
const FALLBACK_MODEL = 'gemini-2.5-flash';
const STREAM_IDLE_MS = 4 * 60 * 1000;   // video ingestion can take a while before the first token
const MAX_ROUNDS = 6;                   // continuation rounds if output is cut at MAX_TOKENS

/* ---------- Icons (Lucide, inline) ---------- */
const ICONS = {
  settings: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  clipboard: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  share: '<path d="M12 2v13"/><path d="m16 6-4-4-4 4"/><path d="M4 14v6a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-6"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  external: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  eye: '<path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  alert: '<circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>',
  sparkles: '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/>',
  x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
};
const icon = (name, size = 20) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;

/* ---------- Settings ----------
   apiKey lives in localStorage only if rememberKey, else sessionStorage (gone when the app closes) */
const SKEY = 'recap-settings', KKEY = 'recap-apikey';
const Settings = {
  load() {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(SKEY)) || {}; } catch {}
    s.apiKey = (s.rememberKey !== false ? localStorage.getItem(KKEY) : null) || sessionStorage.getItem(KKEY) || '';
    return s;
  },
  save(s) {
    const { apiKey, ...rest } = s;
    localStorage.setItem(SKEY, JSON.stringify(rest));
    if (s.rememberKey) { localStorage.setItem(KKEY, apiKey); sessionStorage.removeItem(KKEY); }
    else { sessionStorage.setItem(KKEY, apiKey); localStorage.removeItem(KKEY); }
  },
  forgetKey() { localStorage.removeItem(KKEY); sessionStorage.removeItem(KKEY); },
};
let settings = Object.assign({
  apiKey: '', model: FALLBACK_MODEL, modelPicked: false,
  mediaRes: 'low', summaryLang: 'ko', rememberKey: true,
}, Settings.load());

/* ---------- Storage (IndexedDB) ---------- */
const DB = {
  db: null,
  open() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('recap', 1);
      r.onupgradeneeded = e => e.target.result.createObjectStore('videos', { keyPath: 'id' });
      r.onsuccess = () => { DB.db = r.result; res(); };
      r.onerror = () => rej(r.error);
    });
  },
  req(r) { return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); },
  store(mode) { return DB.db.transaction('videos', mode).objectStore('videos'); },
  put(v) { return DB.req(DB.store('readwrite').put(v)); },
  all() { return DB.req(DB.store('readonly').getAll()); },
  get(id) { return DB.req(DB.store('readonly').get(id)); },
  del(id) { return DB.req(DB.store('readwrite').delete(id)); },
};

/* ---------- Gemini API ---------- */
const authHeaders = extra => ({ 'x-goog-api-key': settings.apiKey, ...extra });

async function apiError(r) {
  let msg = `HTTP ${r.status}`;
  try { msg = (await r.json()).error?.message || msg; } catch {}
  if ((r.status === 400 || r.status === 403) && /API key/i.test(msg)) return new Error('Invalid API key. Check it in Settings.');
  if (r.status === 429) return new Error('Gemini rate limit reached. Wait a minute and retry.');
  if (r.status === 404 && /model/i.test(msg)) return new Error(`Model "${settings.model}" is not available for your key. Pick another in Settings.`);
  if (/youtube|video|not supported|unsupported|cannot|unable|fetch|access/i.test(msg) && r.status < 500) {
    return new Error(`Gemini couldn't read this video (private, members-only, live, age-restricted or too long?). Details: ${msg}`);
  }
  return new Error(msg);
}

/* Streams one generateContent call. onText gets the accumulated text. */
async function streamGenerate({ parts, priorTurns = [], system, generationConfig = {}, onText, signal }) {
  const body = {
    contents: [...priorTurns, { role: 'user', parts }],
    generationConfig: { maxOutputTokens: 65536, ...generationConfig },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const r = await fetch(`${API}/v1beta/models/${settings.model}:streamGenerateContent?alt=sse`, {
    method: 'POST', signal, headers: authHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body),
  });
  if (!r.ok) throw await apiError(r);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = '', text = '', finish = '';
  let idle;
  const armIdle = () => { clearTimeout(idle); idle = setTimeout(() => reader.cancel('idle'), STREAM_IDLE_MS); };
  armIdle();
  const onAbort = () => reader.cancel("abort");
  if (signal) signal.addEventListener("abort", onAbort, { once: true });
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      armIdle();
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith('data:')) continue;
        const json = line.slice(5).trim();
        if (!json) continue;
        let o; try { o = JSON.parse(json); } catch { continue; }
        if (o.error) throw new Error(o.error.message || 'Gemini error');
        const c = o.candidates?.[0];
        const t = (c?.content?.parts || []).map(p => p.thought ? '' : (p.text || '')).join('');
        if (t) { text += t; onText && onText(text); }
        if (c?.finishReason) finish = c.finishReason;
        if (o.promptFeedback?.blockReason) throw new Error('Request was blocked: ' + o.promptFeedback.blockReason);
      }
    }
  } finally { clearTimeout(idle); if (signal) signal.removeEventListener("abort", onAbort); }
  if (signal && signal.aborted) throw new Error("Stopped.");
  if (!finish && !text) throw new Error('No response from Gemini for 4 minutes — stopped. Try again.');
  if (finish === 'SAFETY' || finish === 'RECITATION') throw new Error(`Gemini stopped the response (${finish}).`);
  return { text, finish };
}

/* Repeats with "continue" turns when the output is cut at MAX_TOKENS. */
async function generateFull(opts) {
  let turns = [], all = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const parts = round === 0 ? opts.parts
      : [{ text: 'Your output was cut off. Continue exactly from where it stopped, in the same format. Do not repeat anything already written.' }];
    const { text, finish } = await streamGenerate({ ...opts, parts, priorTurns: turns, onText: t => opts.onText && opts.onText(all + t) });
    turns = [...turns, { role: 'user', parts }, { role: 'model', parts: [{ text }] }];
    all += text;
    if (finish !== 'MAX_TOKENS') break;
  }
  return all.trim();
}

async function fetchModels() {
  const r = await fetch(`${API}/v1beta/models?pageSize=200`, { headers: authHeaders() });
  if (!r.ok) throw await apiError(r);
  const data = await r.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
    .map(m => m.name.replace('models/', ''))
    .filter(n => n.startsWith('gemini') && !/embedding|image|tts|live|audio|robotics|computer-use|lite/.test(n))
    .sort();
}
// Newest stable Flash (gemini-X.Y-flash — no preview/exp suffix)
function pickDefaultModel(models) {
  const stable = models
    .map(n => ({ n, m: n.match(/^gemini-(\d+)(?:\.(\d+))?-flash$/) }))
    .filter(x => x.m)
    .sort((a, b) => (+b.m[1] - +a.m[1]) || ((+b.m[2] || 0) - (+a.m[2] || 0)));
  return stable[0]?.n || models.find(n => /flash/.test(n)) || settings.model;
}

/* ---------- Prompts ---------- */
function transcribePrompt() {
  return `Transcribe this YouTube video completely and faithfully, in the language actually spoken (do not translate).

Output format — plain text, no markdown, no commentary:
Line 1: TITLE: <the video's title>
Line 2: CHANNEL: <channel or speaker name, or "unknown">
Line 3: LANG: <ISO 639-1 code of the main spoken language, e.g. ko, en>
Line 4: empty
Then the transcript, one segment per line, each starting with a timestamp in square brackets:
[mm:ss] spoken text
Use [h:mm:ss] once past one hour. Start a new segment roughly every 15–40 seconds, or when the speaker or topic changes.

Rules: include everything that is said — do not summarise, skip or paraphrase. Keep numbers, tickers, company names, people and technical terms exactly as spoken. Drop filler sounds ("um", "어"). If on-screen text adds important numbers not spoken aloud, you may add them in parentheses. Write Korean speech in Korean, English speech in English.`;
}

const LENGTH_SPEC = {
  standard: {
    ko: `형식 (마크다운, 헤딩은 정확히 아래대로):
## 결론
- 결론·주장 3개. 각각 한 문장. "영상은 ~를 다룬다" 같은 설명이 아니라, 화자가 실제로 주장하는 내용(So what)을 쓴다.
## 핵심 내용
- 5~10개 불릿. 각 불릿은 "주장 — 근거/이유" 구조. 핵심 주장 끝에는 출처 타임스탬프 [mm:ss]를 붙인다.
## 팩트
- 영상에 나온 구체적 숫자·종목·지표·날짜·인물·제품. "항목 — 값 [mm:ss]" 형태의 불릿. 없으면 "특별한 수치 언급 없음" 한 줄.
## 반론·리스크
- 화자가 인정한 불확실성, 반대 시나리오, 조건·전제. 없으면 한 줄로 그렇다고 쓴다.
## 타임라인
- 영상 전체를 순서대로 8~15개 구간으로. 각 줄은 정확히 "- [mm:ss] 구간 주제" 형태 (주제는 15자 내외).`,
    en: `Format (markdown, headings exactly as below):
## Conclusion
- 3 takeaways, one sentence each. Not "the video discusses X" — state what the speaker actually claims (the "so what").
## Key points
- 5–10 bullets. Each bullet = "claim — evidence/reasoning". End key claims with a source timestamp [mm:ss].
## Facts
- Concrete numbers, tickers, indicators, dates, people, products mentioned. Bullets like "item — value [mm:ss]". If none, say so in one line.
## Counterpoints & risks
- Uncertainties the speaker admits, opposing scenarios, conditions/assumptions. If none, say so in one line.
## Timeline
- 8–15 segments covering the whole video in order. Each line exactly "- [mm:ss] topic" (topic ≤ 8 words).`,
  },
  short: {
    ko: `형식 (마크다운, 헤딩은 정확히 아래대로):
## 결론
- 결론·주장 3개, 각 한 문장. 화자의 실제 주장(So what)만. 핵심 주장 끝에 [mm:ss].
## 숫자
- 가장 중요한 수치·종목·날짜 최대 3개. "항목 — 값 [mm:ss]". 없으면 이 섹션 생략.
그 외 섹션은 쓰지 않는다.`,
    en: `Format (markdown, headings exactly as below):
## Conclusion
- 3 takeaways, one sentence each. Only what the speaker actually claims. End key claims with [mm:ss].
## Numbers
- Up to 3 most important figures/tickers/dates. "item — value [mm:ss]". Omit this section if none.
Write nothing else.`,
  },
  detailed: {
    ko: `형식 (마크다운):
## 결론
- 결론·주장 3~5개, 각 한 문장, 핵심 주장 끝에 [mm:ss].
## 상세
영상의 주제 흐름을 따라 ### 소제목으로 나눈다(4~8개). 각 소제목 아래에 화자의 주장, 근거, 예시, 숫자를 빠짐없이 불릿이나 짧은 문단으로 정리한다. 주장·숫자마다 [mm:ss]를 붙인다. 화자 간 의견 차이가 있으면 누가 뭐라 했는지 구분한다.
## 팩트
- 영상에 나온 모든 구체적 숫자·종목·지표·날짜·인물·제품. "항목 — 값 [mm:ss]".
## 반론·리스크
- 화자가 인정한 불확실성, 반대 시나리오, 조건·전제.
## 용어
- 일반 독자가 모를 수 있는 용어·약어 3~8개를 한 줄씩 설명. 없으면 생략.`,
    en: `Format (markdown):
## Conclusion
- 3–5 takeaways, one sentence each, key claims end with [mm:ss].
## In detail
Follow the video's flow with ### subheadings (4–8). Under each, capture the speaker's claims, reasoning, examples and numbers exhaustively as bullets or short paragraphs. Attach [mm:ss] to claims and numbers. If speakers disagree, attribute who said what.
## Facts
- Every concrete number, ticker, indicator, date, person, product. "item — value [mm:ss]".
## Counterpoints & risks
- Uncertainties admitted, opposing scenarios, conditions/assumptions.
## Glossary
- 3–8 terms/abbreviations a general reader may not know, one line each. Omit if none.`,
  },
};

function summaryPrompt(rec, length, outLang) {
  const ko = outLang === 'ko';
  const langLine = ko
    ? '출력 언어: 한국어. 단, 고유명사·티커·약어·지표명(NVDA, Fed, CPI, GDP 등)은 번역하지 말고 원문 표기 그대로 쓴다.'
    : `Output language: the language the video is spoken in (${rec.lang || 'as in the transcript'}). Keep proper nouns, tickers and abbreviations exactly as in the source.`;
  const hasTs = /\[\d{1,2}:\d{2}(:\d{2})?\]/.test(rec.transcript || '');
  const tsLine = hasTs
    ? (ko ? '타임스탬프는 스크립트에 있는 [mm:ss] 값을 그대로 사용한다(새로 만들지 말 것). 모든 문장에 붙이지 말고 핵심 주장·숫자에만 붙인다.'
          : 'Use the [mm:ss] timestamps that appear in the transcript (never invent them). Attach them only to key claims and numbers, not to every sentence.')
    : (ko ? '이 스크립트에는 타임스탬프가 없다. [mm:ss] 표시는 모두 생략하고, 타임라인 섹션은 쓰지 않는다.'
          : 'This transcript has no timestamps. Omit all [mm:ss] markers and skip the Timeline section.');
  const system = ko
    ? `당신은 바쁜 독자를 위해 유튜브 영상을 대신 보고 정리하는 애널리스트다. 독자는 영상을 보지 않을 것이므로, 나열이 아니라 "그래서 결론이 뭔가"가 먼저 보여야 한다. 화자가 말하지 않은 내용을 지어내지 않는다. 과장·홍보성 표현은 걷어내고 사실과 주장만 남긴다. ${langLine} ${tsLine}`
    : `You are an analyst who watches YouTube videos on behalf of a busy reader. The reader will not watch the video, so the conclusion must come first — not a play-by-play. Never invent content the speaker did not say. Strip hype; keep facts and claims. ${langLine} ${tsLine}`;
  const spec = LENGTH_SPEC[length][ko ? 'ko' : 'en'];
  const head = [rec.title ? `Title: ${rec.title}` : '', rec.channel ? `Channel: ${rec.channel}` : ''].filter(Boolean).join('\n');
  const user = `${spec}\n\n---\n${head}\n\nTranscript:\n${rec.transcript}`;
  return { system, user };
}

/* ---------- YouTube helpers ---------- */
function parseYouTube(input) {
  const s = (input || '').trim();
  if (!s) return null;
  const m = s.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|live\/|embed\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)
    || s.match(/^([A-Za-z0-9_-]{11})$/);
  return m ? m[1] : null;
}
function findYouTubeUrl(text) {
  const m = (text || '').match(/https?:\/\/[^\s"'<>]*(?:youtube\.com|youtu\.be)[^\s"'<>]*/);
  return m ? m[0] : null;
}
const watchUrl = id => `https://www.youtube.com/watch?v=${id}`;
const thumbUrl = id => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
const tsToSec = ts => ts.split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
const atUrl = (id, ts) => `https://youtu.be/${id}?t=${tsToSec(ts)}`;

async function fetchOEmbed(id) {
  try {
    const r = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl(id))}&format=json`);
    if (!r.ok) return null;
    const j = await r.json();
    return { title: j.title, channel: j.author_name };
  } catch { return null; }
}

/* ---------- Transcript / summary parsing ---------- */
function parseTranscriptOutput(text) {
  const meta = {};
  const lines = text.split('\n');
  let i = 0;
  for (; i < lines.length && i < 6; i++) {
    const m = lines[i].match(/^\s*(TITLE|CHANNEL|LANG)\s*:\s*(.+)$/i);
    if (m) meta[m[1].toLowerCase()] = m[2].trim();
    else if (lines[i].trim() === '' && Object.keys(meta).length) { i++; break; }
    else if (!Object.keys(meta).length && /^\s*\[\d/.test(lines[i])) break;
  }
  const body = lines.slice(Object.keys(meta).length ? i : 0).join('\n').trim();
  return { meta, transcript: body };
}
const TS_RE = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g;

/* Splits off the "## Timeline" section, returns {summary, timeline:[{t,title}]} */
function splitTimeline(md) {
  const m = md.match(/^## +(타임라인|Timeline)\s*$/m);
  if (!m) return { summary: md.trim(), timeline: null };
  const start = m.index;
  const rest = md.slice(start + m[0].length);
  const next = rest.search(/^## /m);
  const section = next >= 0 ? rest.slice(0, next) : rest;
  const tail = next >= 0 ? rest.slice(next) : '';
  const timeline = [];
  for (const line of section.split('\n')) {
    const mm = line.match(/^\s*(?:[-*]|\d+\.)\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*[—–-]?\s*(.+)$/);
    if (mm) timeline.push({ t: mm[1], title: mm[2].trim() });
  }
  return { summary: (md.slice(0, start) + tail).trim(), timeline };
}
function firstBullets(md, n = 3) {
  const out = [];
  for (const line of md.split('\n')) {
    if (/^## /.test(line) && out.length) break;
    const m = line.match(/^\s*[-*]\s+(.*)$/);
    if (m) out.push(m[1].replace(TS_RE, '').replace(/\*\*/g, '').trim());
    if (out.length >= n) break;
  }
  return out;
}
function lastTimestamp(transcript) {
  let last = null, m;
  const re = new RegExp(TS_RE.source, 'g');
  while ((m = re.exec(transcript || ''))) last = m[1];
  return last;
}

/* ---------- Minimal markdown → HTML (safe: escapes first) ---------- */
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function inline(s, videoId) {
  let h = esc(s);
  h = h.replace(/`([^`]+)`/g, '<code>$1</code>');
  h = h.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(^|[\s(])\*([^*\s][^*]*?)\*(?=[\s).,;:!?]|$)/g, '$1<em>$2</em>');
  h = h.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  if (videoId) h = h.replace(TS_RE, (_, t) => `<a class="ts" href="${atUrl(videoId, t)}" target="_blank" rel="noopener">${t}</a>`);
  else h = h.replace(TS_RE, '<span class="ts">$1</span>');
  return h;
}
function renderMarkdown(md, videoId, { tldrFirst = true } = {}) {
  const lines = (md || '').replace(/\r/g, '').split('\n');
  let html = '', list = null, para = [], table = null, h2count = 0, inTldr = false;
  const flushPara = () => { if (para.length) { html += `<p>${inline(para.join(' '), videoId)}</p>`; para = []; } };
  const flushList = () => { if (list) { html += `</${list}>`; list = null; } };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    html += '<table><thead><tr>' + head.map(c => `<th>${inline(c, videoId)}</th>`).join('') + '</tr></thead><tbody>'
      + rows.map(r => '<tr>' + r.map(c => `<td>${inline(c, videoId)}</td>`).join('') + '</tr>').join('') + '</tbody></table>';
    table = null;
  };
  const flushAll = () => { flushPara(); flushList(); flushTable(); };
  const closeTldr = () => { if (inTldr) { flushAll(); html += '</div>'; inTldr = false; } };
  for (const raw of lines) {
    const line = raw.replace(/\s+$/, '');
    let m;
    if ((m = line.match(/^(#{1,3})\s+(.*)$/))) {
      flushAll();
      const lvl = m[1].length;
      if (lvl <= 2) {
        closeTldr();
        h2count++;
        if (tldrFirst && h2count === 1) { html += '<div class="tldr">'; inTldr = true; }
      }
      const tag = lvl === 1 ? 'h2' : `h${lvl}`;
      html += `<${tag}>${inline(m[2], videoId)}</${tag}>`;
      continue;
    }
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) { flushAll(); html += '<hr>'; continue; }
    if ((m = line.match(/^\s*\|(.+)\|\s*$/))) {
      flushPara(); flushList();
      const cells = m[1].split('|').map(c => c.trim());
      if (cells.every(c => /^:?-{2,}:?$/.test(c))) continue; // separator row
      if (!table) table = [];
      table.push(cells);
      continue;
    }
    if (table) flushTable();
    if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ul') { flushList(); html += '<ul>'; list = 'ul'; }
      html += `<li>${inline(m[1], videoId)}</li>`;
      continue;
    }
    if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      flushPara();
      if (list !== 'ol') { flushList(); html += '<ol>'; list = 'ol'; }
      html += `<li>${inline(m[1], videoId)}</li>`;
      continue;
    }
    if ((m = line.match(/^\s*>\s?(.*)$/))) { flushAll(); html += `<blockquote>${inline(m[1], videoId)}</blockquote>`; continue; }
    if (line.trim() === '') { flushAll(); continue; }
    flushList(); flushTable();
    para.push(line.trim());
  }
  flushAll(); closeTldr();
  return html;
}
function renderTranscript(text, videoId) {
  const out = [];
  for (const line of (text || '').split('\n')) {
    const m = line.match(/^\s*\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)$/);
    if (m) out.push(`<p><a class="ts" href="${atUrl(videoId, m[1])}" target="_blank" rel="noopener">${m[1]}</a><span>${esc(m[2])}</span></p>`);
    else if (line.trim()) out.push(`<p><span>${esc(line)}</span></p>`);
  }
  return out.join('');
}
function toMarkdownExport(rec) {
  const tl = (rec.timeline || []).map(x => `- [${x.t}] ${x.title}`).join('\n');
  const s = rec.summaries || {};
  const body = s.standard || s.short || s.detailed || '';
  return `# ${rec.title || 'Untitled'}\n${rec.channel ? rec.channel + ' · ' : ''}${watchUrl(rec.videoId)}\n\n${body}\n${tl ? `\n## Timeline\n${tl}\n` : ''}`;
}

/* ---------- State, events, queue ---------- */
let records = [];        // in-memory cache of all records, newest first
const listeners = new Set();
const emit = (type, id, extra) => listeners.forEach(fn => fn(type, id, extra));
const byId = id => records.find(r => r.id === id);
async function saveRec(rec) {
  rec.updatedAt = Date.now();
  const { live, ...persist } = rec;
  await DB.put(persist);
  if (!byId(rec.id)) records.unshift(rec);
  emit('change', rec.id);
}

const queue = [];
let running = null;          // { id, abort }
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch {}
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && running) keepAwake(true); });

function enqueue(id, task) {
  if (queue.some(j => j.id === id && j.task === task) || (running && running.id === id && running.task === task)) return;
  queue.push({ id, task });
  pump();
}
async function pump() {
  if (running || !queue.length) return;
  const job = queue.shift();
  const abort = new AbortController();
  running = { ...job, abort };
  keepAwake(true);
  try { await runJob(job, abort.signal); }
  catch (e) {
    const rec = byId(job.id);
    if (rec) {
      rec.status = 'error';
      rec.error = abort.signal.aborted ? 'Stopped.' : (e.message || String(e));
      await saveRec(rec);
    }
  }
  finally {
    running = null;
    if (!queue.length) keepAwake(false);
    pump();
  }
}
function cancelJob(id) {
  const qi = queue.findIndex(j => j.id === id);
  if (qi >= 0) queue.splice(qi, 1);
  if (running && running.id === id) running.abort.abort();
}

/* task: 'full' (transcribe then standard), 'summary:<length>' */
async function runJob(job, signal) {
  const rec = byId(job.id);
  if (!rec) return;
  if (!settings.apiKey) throw new Error('Add your Gemini API key in Settings first.');

  if (job.task === 'full' && !rec.transcript) {
    rec.status = 'transcribing'; rec.error = ''; rec.live = '';
    await saveRec(rec);
    const parts = [
      { fileData: { fileUri: watchUrl(rec.videoId) } },
      { text: transcribePrompt() },
    ];
    const generationConfig = { temperature: 0.2 };
    if (settings.mediaRes === 'low') generationConfig.mediaResolution = 'MEDIA_RESOLUTION_LOW';
    const raw = await generateFull({
      parts, generationConfig, signal,
      onText: t => { rec.live = t; emit('live', rec.id, t); },
    });
    if (signal.aborted) throw new Error("Stopped.");
    const { meta, transcript } = parseTranscriptOutput(raw);
    if (!transcript || transcript.length < 40) throw new Error('Gemini returned an empty transcript. The video may have no speech, or it could not be read.');
    rec.transcript = transcript;
    rec.lang = meta.lang || rec.lang || '';
    if (meta.title && (!rec.title || rec.titleSource !== 'oembed')) { rec.title = meta.title; rec.titleSource = 'gemini'; }
    if (meta.channel && meta.channel.toLowerCase() !== 'unknown' && !rec.channel) rec.channel = meta.channel;
    rec.duration = lastTimestamp(transcript);
    rec.model = settings.model;
    rec.live = '';
    await saveRec(rec);
  }

  const length = job.task.startsWith('summary:') ? job.task.slice(8) : 'standard';
  rec.status = 'summarizing'; rec.error = ''; rec.summarizing = length; rec.live = '';
  await saveRec(rec);
  const outLang = settings.summaryLang === 'original' ? 'original' : 'ko';
  const { system, user } = summaryPrompt(rec, length, outLang);
  const md = await generateFull({
    parts: [{ text: user }], system, signal,
    generationConfig: { temperature: 0.3 },
    onText: t => { rec.live = t; emit('live', rec.id, t); },
  });
  if (signal.aborted) throw new Error("Stopped.");
  if (!md) throw new Error('Gemini returned an empty summary. Try again.');
  const { summary, timeline } = splitTimeline(md);
  rec.summaries = rec.summaries || {};
  rec.summaries[length] = summary;
  rec.summaryLang = rec.summaryLang || {};
  rec.summaryLang[length] = outLang;
  if (timeline && timeline.length) rec.timeline = timeline;
  if (length === 'standard' || !rec.tldr) rec.tldr = firstBullets(summary).join(' · ');
  rec.status = 'done'; rec.summarizing = ''; rec.live = '';
  await saveRec(rec);
}

/* ---------- Actions ---------- */
async function startVideo(input) {
  const videoId = parseYouTube(input);
  if (!videoId) { toast('That does not look like a YouTube link'); return null; }
  if (!settings.apiKey) { toast('Add your Gemini API key first'); go('#settings'); return null; }
  const existing = records.find(r => r.videoId === videoId);
  if (existing && existing.transcript) { go(`#v/${existing.id}`); toast('Already summarised — opened it'); return existing; }
  const rec = existing || {
    id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2)),
    videoId, url: watchUrl(videoId), createdAt: Date.now(),
    title: '', channel: '', transcript: '', summaries: {}, timeline: null, tldr: '', status: 'queued', source: 'youtube',
  };
  rec.status = 'queued'; rec.error = '';
  await saveRec(rec);
  go(`#v/${rec.id}`);
  fetchOEmbed(videoId).then(async meta => {
    if (!meta) return;
    const r = byId(rec.id); if (!r) return;
    r.title = meta.title || r.title; r.titleSource = 'oembed';
    r.channel = meta.channel || r.channel;
    await saveRec(r);
  });
  enqueue(rec.id, 'full');
  return rec;
}
async function startFromTranscript(videoInput, text) {
  const videoId = parseYouTube(videoInput) || null;
  const transcript = (text || '').trim();
  if (transcript.length < 40) { toast('Paste a longer transcript'); return null; }
  if (!settings.apiKey) { toast('Add your Gemini API key first'); go('#settings'); return null; }
  let rec = videoId ? records.find(r => r.videoId === videoId) : null;
  if (!rec) {
    rec = {
      id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      videoId: videoId || '', url: videoId ? watchUrl(videoId) : '', createdAt: Date.now(),
      title: '', channel: '', summaries: {}, timeline: null, tldr: '', source: 'paste',
    };
    if (videoId) fetchOEmbed(videoId).then(async meta => { if (meta) { const r = byId(rec.id); if (r) { r.title = meta.title; r.titleSource = 'oembed'; r.channel = meta.channel; await saveRec(r); } } });
  }
  rec.transcript = transcript; rec.source = 'paste'; rec.status = 'queued'; rec.error = '';
  rec.duration = lastTimestamp(transcript);
  rec.summaries = {}; rec.timeline = null;
  if (!rec.title) rec.title = 'Pasted transcript';
  await saveRec(rec);
  go(`#v/${rec.id}`);
  enqueue(rec.id, 'summary:standard');
  return rec;
}
async function deleteRec(id) {
  cancelJob(id);
  await DB.del(id);
  records = records.filter(r => r.id !== id);
  emit('change', id);
}

/* ---------- UI helpers ---------- */
let toastTimer;
function toast(msg, ms = 2200) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), ms);
}
async function copyText(text, okMsg = 'Copied') {
  try { await navigator.clipboard.writeText(text); toast(okMsg); return true; }
  catch {
    const ta = document.createElement('textarea'); ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {}
    ta.remove(); toast(ok ? okMsg : 'Copy failed'); return ok;
  }
}
async function shareText(title, text) {
  if (navigator.share) { try { await navigator.share({ title, text }); return; } catch (e) { if (e.name === 'AbortError') return; } }
  copyText(text, 'Copied — sharing not available here');
}
const fmtDate = ts => new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: new Date(ts).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
function fmtDuration(ts) {
  if (!ts) return '';
  const s = tsToSec(ts);
  const h = Math.floor(s / 3600), m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}
const go = hash => { location.hash = hash; };

/* ---------- Views ---------- */
const app = () => $('app');
let currentView = '';
let liveEl = null;   // element showing streaming text in detail view

function render() {
  const h = location.hash || '';
  const topbarBtn = $('btnSettings');
  if (h.startsWith('#v/')) { currentView = 'detail'; renderDetail(h.slice(3)); }
  else if (h === '#settings') { currentView = 'settings'; renderSettings(); }
  else { currentView = 'home'; renderHome(); }
  $("btnBack").hidden = currentView !== "detail";
  $("btnBack").innerHTML = icon("back", 22);
  topbarBtn.innerHTML = currentView === "settings" ? icon("x") : icon("settings");
  topbarBtn.setAttribute('aria-label', currentView === 'settings' ? 'Close settings' : 'Settings');
  window.scrollTo(0, 0);
}

function renderHome() {
  const el = app();
  el.innerHTML = `
  <section class="view fade-in">
    <div class="hero">
      <h1>What did they actually say?</h1>
      <p>Paste a YouTube link. Get the conclusion first, then the evidence — with timestamps you can check.</p>
    </div>
    <form class="inputcard" id="urlForm" autocomplete="off">
      <span class="ic-link">${icon('link', 18)}</span>
      <input id="urlInput" type="url" inputmode="url" placeholder="youtube.com/watch?v=…" enterkeyhint="go" spellcheck="false">
      <button type="button" class="btn btn-ghost" id="btnPaste" title="Paste from clipboard">${icon('clipboard', 18)}<span class="lbl-paste">Paste</span></button>
      <button type="submit" class="btn btn-primary" id="btnGo">Recap</button>
    </form>
    <p class="hint">Public videos only · ${settings.summaryLang === 'ko' ? 'Summary in Korean' : 'Summary in the video’s language'} · <button type="button" id="btnPasteTranscript">Have a transcript instead?</button></p>
    <div id="pasteBox" hidden style="margin-top:12px">
      <textarea class="paste" id="pasteText" placeholder="Paste the transcript here (timestamps like [12:34] are kept if present)…"></textarea>
      <div class="btn-row" style="margin-top:8px">
        <input id="pasteUrl" type="url" placeholder="YouTube link (optional, for timestamps)" style="flex:1;min-width:0;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:9px 12px;font-size:16px;outline:none">
        <button type="button" class="btn btn-primary" id="btnPasteGo">Summarise</button>
      </div>
    </div>
    <div class="section-head"><h2>Library</h2><span id="count" style="font-size:12px;color:var(--ink-faint)"></span></div>
    <div class="searchbox" id="searchWrap" hidden>${icon('search', 16)}<input id="search" type="search" placeholder="Search titles and summaries"></div>
    <div class="list" id="list"></div>
  </section>`;
  const input = $('urlInput');
  $('urlForm').onsubmit = e => { e.preventDefault(); startVideo(input.value); input.value = ''; };
  input.addEventListener('paste', () => setTimeout(() => { if (parseYouTube(input.value)) { startVideo(input.value); input.value = ''; } }, 0));
  $('btnPaste').onclick = async () => {
    try {
      const t = await navigator.clipboard.readText();
      const url = findYouTubeUrl(t) || (parseYouTube(t) ? t : null);
      if (url) { input.value = url; startVideo(url); input.value = ''; }
      else toast('No YouTube link in clipboard');
    } catch { toast('Clipboard not available — paste into the box'); input.focus(); }
  };
  $('btnPasteTranscript').onclick = () => { const b = $('pasteBox'); b.hidden = !b.hidden; if (!b.hidden) $('pasteText').focus(); };
  $('btnPasteGo').onclick = () => startFromTranscript($('pasteUrl').value, $('pasteText').value);
  $('search').oninput = () => renderList($('search').value);
  renderList('');
}
function renderList(q) {
  const list = $('list'); if (!list) return;
  const needle = (q || '').trim().toLowerCase();
  const items = records.filter(r => !needle || [r.title, r.channel, r.tldr, r.summaries?.standard].join(' ').toLowerCase().includes(needle));
  $('count').textContent = records.length ? `${records.length}` : '';
  $('searchWrap').hidden = records.length < 4;
  if (!records.length) { list.innerHTML = `<div class="empty">Nothing here yet. Paste a link above to make your first recap.</div>`; return; }
  if (!items.length) { list.innerHTML = `<div class="empty">No matches.</div>`; return; }
  list.innerHTML = items.map(r => `
    <button class="item" data-id="${r.id}">
      <div class="thumb">${r.videoId ? `<img src="${thumbUrl(r.videoId)}" alt="" loading="lazy">` : ''}</div>
      <div class="item-body">
        <div class="item-title">${esc(r.title || (r.status === 'transcribing' ? 'Reading video…' : 'Untitled'))}</div>
        <div class="item-meta">${r.channel ? `<span>${esc(r.channel)}</span><span class="sep">·</span>` : ''}<span>${fmtDate(r.createdAt)}</span>${r.duration ? `<span class="sep">·</span><span>${fmtDuration(r.duration)}</span>` : ''}</div>
        ${statusLine(r) || (r.tldr ? `<div class="item-tldr">${esc(r.tldr)}</div>` : '')}
      </div>
    </button>`).join('');
  list.querySelectorAll('.item').forEach(b => b.onclick = () => go(`#v/${b.dataset.id}`));
}
function statusLine(r) {
  if (r.status === 'queued') return `<span class="status"><span class="dot"></span>Queued</span>`;
  if (r.status === 'transcribing') return `<span class="status"><span class="dot"></span>Reading video</span>`;
  if (r.status === 'summarizing') return `<span class="status"><span class="dot"></span>Writing ${r.summarizing || 'summary'}</span>`;
  if (r.status === 'error') return `<span class="status err">${icon('alert', 13)}Failed — tap to retry</span>`;
  return '';
}

let detailTab = 'standard', detailId = null;
function renderDetail(id) {
  const rec = byId(id);
  const el = app();
  if (!rec) { el.innerHTML = `<section class="view"><div class="empty">Not found.</div></section>`; return; }
  if (detailId !== id) {   // fresh open → land on the best available tab
    detailId = id;
    const s = rec.summaries || {};
    detailTab = s.standard ? 'standard' : s.short ? 'short' : s.detailed ? 'detailed' : 'standard';
  }
  el.innerHTML = `
  <section class="view fade-in">
    <div class="vhead">
      ${rec.videoId ? `<a class="thumb-lg" href="${watchUrl(rec.videoId)}" target="_blank" rel="noopener" aria-label="Open on YouTube">
        <img src="${thumbUrl(rec.videoId)}" alt="">
        <span class="play"><span class="play-badge">${icon('play', 22)}</span></span>
      </a>` : ''}
      <h1>${esc(rec.title || (rec.status === 'transcribing' ? 'Reading video…' : 'Untitled'))}</h1>
      <div class="meta">
        ${rec.channel ? `<span>${esc(rec.channel)}</span><span class="sep">·</span>` : ''}
        <span>${fmtDate(rec.createdAt)}</span>
        ${rec.duration ? `<span class="sep">·</span><span>${fmtDuration(rec.duration)}</span>` : ''}
        ${rec.model ? `<span class="sep">·</span><span style="font-family:var(--mono);font-size:11.5px">${esc(rec.model)}</span>` : ''}
      </div>
    </div>
    <div id="detailBody"></div>
  </section>`;
  renderDetailBody(rec);
}
function renderDetailBody(rec) {
  const host = $('detailBody'); if (!host) return;
  liveEl = null;
  const busy = rec.status === 'queued' || rec.status === 'transcribing' || rec.status === 'summarizing';
  const hasStd = !!rec.summaries?.standard;
  let html = '';

  if (busy) {
    const stepIdx = rec.status === 'summarizing' ? 1 : 0;
    const label = rec.status === 'queued' ? 'Waiting in queue'
      : rec.status === 'transcribing' ? 'Reading the video'
      : `Writing the ${rec.summarizing || 'standard'} summary`;
    const sub = rec.status === 'transcribing' ? 'Gemini is listening to the whole video and writing a timestamped transcript. A 1-hour video takes 1–3 minutes.'
      : rec.status === 'summarizing' ? 'Conclusion first, then evidence and facts.'
      : 'Another video is being processed first.';
    html += `<div class="progress">
      <div class="row"><span class="spinner"></span><div><div class="label">${label}</div><div class="sub">${sub}</div></div></div>
      ${rec.source === 'paste' ? '' : `<div class="steps"><span class="${stepIdx > 0 ? 'done' : 'on'}"></span><span class="${stepIdx === 1 ? 'on' : ''}"></span></div>`}
      <div class="live" id="live">${esc((rec.live || '').slice(-600))}</div>
      <div class="btn-row"><button class="btn btn-ghost" id="btnStop">Stop</button></div>
    </div>`;
  }
  if (rec.status === 'error') {
    html += `<div class="errorbox">
      <div class="title">${icon('alert', 18)}Couldn't finish</div>
      <div class="msg">${esc(rec.error || 'Unknown error')}</div>
      <div class="btn-row">
        <button class="btn btn-primary" id="btnRetry">${icon('refresh', 16)}Retry</button>
        ${rec.transcript ? '' : `<button class="btn btn-soft" id="btnFallback">${icon('fileText', 16)}Paste a transcript instead</button>`}
      </div>
      <div id="fallbackBox" hidden>
        <textarea class="paste" id="fallbackText" placeholder="Open the video on YouTube → ··· → Show transcript → copy and paste here"></textarea>
        <div class="btn-row" style="margin-top:8px"><button class="btn btn-primary" id="btnFallbackGo">Summarise this transcript</button></div>
      </div>
    </div>`;
  }

  if (hasStd || rec.transcript) {
    const tabs = [
      ['short', 'Short'], ['standard', 'Standard'], ['detailed', 'Detailed'], ['transcript', 'Transcript'],
    ];
    html += `<div class="tabs" role="tablist" style="${busy || rec.status === 'error' ? 'margin-top:16px' : ''}">${tabs.map(([k, l]) =>
      `<button class="tab" role="tab" data-tab="${k}" aria-selected="${detailTab === k}">${l}</button>`).join('')}</div>`;
    html += `<div class="panel" id="panel"></div>`;
    html += `<div class="actions">
      ${rec.videoId ? `<a class="btn btn-soft" href="${watchUrl(rec.videoId)}" target="_blank" rel="noopener">${icon('external', 16)}Open video</a>` : ''}
      <button class="btn btn-soft" id="btnCopyMd">${icon('copy', 16)}Copy summary</button>
      <button class="btn btn-soft" id="btnCopyTr" ${rec.transcript ? '' : 'disabled'}>${icon('fileText', 16)}Copy transcript</button>
      <button class="btn btn-soft" id="btnShare">${icon('share', 16)}Share</button>
      <button class="btn btn-danger" id="btnDelete">${icon('trash', 16)}Delete</button>
    </div>`;
  } else if (!busy) {
    html += `<div class="actions solo"><button class="btn btn-ghost" id="btnDelete">${icon('trash', 16)}Delete</button></div>`;
  }
  host.innerHTML = html;
  liveEl = $('live');
  if (liveEl) liveEl.scrollTop = liveEl.scrollHeight;

  const stop = $('btnStop'); if (stop) stop.onclick = () => { cancelJob(rec.id); };
  const retry = $('btnRetry'); if (retry) retry.onclick = () => { rec.status = 'queued'; rec.error = ''; saveRec(rec); enqueue(rec.id, rec.transcript ? 'summary:standard' : 'full'); };
  const fb = $('btnFallback'); if (fb) fb.onclick = () => { $('fallbackBox').hidden = false; $('fallbackText').focus(); };
  const fbGo = $('btnFallbackGo'); if (fbGo) fbGo.onclick = () => startFromTranscript(rec.videoId, $('fallbackText').value);
  host.querySelectorAll('.tab').forEach(b => b.onclick = () => { detailTab = b.dataset.tab; host.querySelectorAll('.tab').forEach(x => x.setAttribute('aria-selected', x === b)); renderPanel(rec); });
  const del = $('btnDelete'); if (del) del.onclick = async () => { if (confirm('Delete this recap?')) { await deleteRec(rec.id); go(''); toast('Deleted'); } };
  const cm = $('btnCopyMd'); if (cm) cm.onclick = () => copyText(toMarkdownExport(rec), 'Summary copied as Markdown');
  const ct = $('btnCopyTr'); if (ct) ct.onclick = () => copyText(`# ${rec.title || ''}\n${rec.url || ''}\n\n${rec.transcript}`, 'Transcript copied');
  const sh = $('btnShare'); if (sh) sh.onclick = () => shareText(rec.title || 'Recap', toMarkdownExport(rec));
  renderPanel(rec);
}
function renderPanel(rec) {
  const p = $('panel'); if (!p) return;
  if (detailTab === 'transcript') {
    p.innerHTML = rec.transcript ? `<div class="transcript">${renderTranscript(rec.transcript, rec.videoId)}</div>`
      : `<div class="empty">No transcript yet.</div>`;
    return;
  }
  const md = rec.summaries?.[detailTab];
  if (md) {
    let html = `<div class="prose">${renderMarkdown(md, rec.videoId)}</div>`;
    if (detailTab === 'standard' && rec.timeline?.length) {
      html += `<div class="prose"><h2>${(rec.summaryLang || {}).standard === "ko" ? "타임라인" : "Timeline"}</h2><ul class="timeline">${rec.timeline.map(x =>
        `<li>${rec.videoId ? `<a class="ts" href="${atUrl(rec.videoId, x.t)}" target="_blank" rel="noopener">${x.t}</a>` : `<span class="ts">${x.t}</span>`}<span class="tl-title">${esc(x.title)}</span></li>`).join('')}</ul></div>`;
    }
    p.innerHTML = html;
    return;
  }
  const busyThis = rec.status === 'summarizing' && rec.summarizing === detailTab;
  if (busyThis || rec.status === 'queued') { p.innerHTML = ''; return; }
  if (!rec.transcript) { p.innerHTML = `<div class="empty">Nothing yet.</div>`; return; }
  p.innerHTML = `<div class="empty" style="padding:28px 12px">
    <div style="margin-bottom:12px;color:var(--ink-soft)">The ${detailTab} version hasn't been written yet.<br><span style="font-size:13px">Uses the saved transcript only — fast and nearly free.</span></div>
    <button class="btn btn-primary" id="btnMake">${icon('sparkles', 16)}Write ${detailTab} summary</button>
  </div>`;
  $('btnMake').onclick = () => { rec.status = 'queued'; rec.summarizing = detailTab; saveRec(rec); enqueue(rec.id, `summary:${detailTab}`); };
}

function renderSettings() {
  const el = app();
  const s = settings;
  el.innerHTML = `
  <section class="view fade-in settings">
    <h1>Settings</h1>
    <div class="field">
      <label for="apiKeyInput">Gemini API key</label>
      <div class="keyrow">
        <input id="apiKeyInput" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="AIza…" value="${esc(s.apiKey)}">
        <button class="iconbtn" id="btnShowKey" aria-label="Show key" aria-pressed="false">${icon('eye')}</button>
      </div>
      <div class="desc">Stored only on this device. Get a key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a>. A 1-hour video costs roughly €0.15–0.40 with Flash.</div>
      <label class="toggle" style="margin-top:10px"><span><span class="t-text">Remember key</span><br><span class="t-sub">Off = forgotten when the app closes</span></span><span class="switch"><input type="checkbox" id="rememberKey" ${s.rememberKey ? 'checked' : ''}><span class="knob"></span></span></label>
    </div>
    <div class="field">
      <label for="modelSelect">Model</label>
      <div class="keyrow">
        <select id="modelSelect"><option value="${esc(s.model)}">${esc(s.model)}</option></select>
        <button class="iconbtn" id="btnModels" aria-label="Refresh model list">${icon('refresh')}</button>
      </div>
      <div class="desc" id="modelDesc">Flash is fast and cheap; Pro is slower and ~5× the cost, sometimes sharper on nuance. Tap refresh to load the models your key can use.</div>
    </div>
    <div class="field">
      <span class="lbl">Video resolution sent to Gemini</span>
      <div class="seg" id="segRes">
        <button data-v="low" aria-pressed="${s.mediaRes === 'low'}">Low (audio-first)</button>
        <button data-v="default" aria-pressed="${s.mediaRes === 'default'}">Default</button>
      </div>
      <div class="desc">Low ≈ 100 tokens/sec, fine for talk and interviews. Default ≈ 300 tokens/sec — use when charts or slides matter.</div>
    </div>
    <div class="field">
      <span class="lbl">Summary language</span>
      <div class="seg" id="segLang">
        <button data-v="ko" aria-pressed="${s.summaryLang === 'ko'}">Korean</button>
        <button data-v="original" aria-pressed="${s.summaryLang === 'original'}">Video's language</button>
      </div>
      <div class="desc">Names, tickers and abbreviations are never translated either way.</div>
    </div>
    <div class="field">
      <span class="lbl">Library</span>
      <div class="btn-row">
        <button class="btn btn-soft" id="btnExport">${icon('download', 16)}Export JSON</button>
        <button class="btn btn-soft" id="btnImport">${icon('upload', 16)}Import JSON</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>
      <div class="desc">Recaps live only on this device. Export to move them to another device or keep a backup.</div>
    </div>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn btn-primary" id="btnSave">Save</button>
      <button class="btn btn-ghost" id="btnForget">Forget key</button>
    </div>
    <div class="about">Recap sends only the YouTube URL and your prompts to Google's Gemini API with your key. Summaries and transcripts stay in this browser. Public videos only — private, members-only and live videos can't be read.</div>
  </section>`;

  $('btnShowKey').onclick = () => {
    const i = $('apiKeyInput'), b = $('btnShowKey');
    const show = i.type === 'password';
    i.type = show ? 'text' : 'password';
    b.setAttribute('aria-pressed', String(show));
    b.innerHTML = icon(show ? 'eyeOff' : 'eye');
  };
  const seg = (id, key) => $(id).querySelectorAll('button').forEach(b => b.onclick = () => {
    settings[key] = b.dataset.v;
    $(id).querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b));
  });
  seg('segRes', 'mediaRes'); seg('segLang', 'summaryLang');
  $('btnModels').onclick = async () => {
    settings.apiKey = $('apiKeyInput').value.trim();
    if (!settings.apiKey) { toast('Enter your API key first'); return; }
    const b = $('btnModels'); b.disabled = true;
    try {
      const models = await fetchModels();
      const sel = $('modelSelect');
      const cur = settings.modelPicked ? settings.model : pickDefaultModel(models);
      sel.innerHTML = models.map(m => `<option value="${m}" ${m === cur ? 'selected' : ''}>${m}</option>`).join('');
      if (!models.includes(cur)) sel.insertAdjacentHTML('afterbegin', `<option value="${esc(cur)}" selected>${esc(cur)}</option>`);
      toast(`${models.length} models loaded`);
    } catch (e) { toast(e.message); }
    finally { b.disabled = false; }
  };
  $('btnSave').onclick = async () => {
    settings.apiKey = $('apiKeyInput').value.trim();
    settings.rememberKey = $('rememberKey').checked;
    const picked = $('modelSelect').value;
    if (picked !== settings.model) settings.modelPicked = true;
    settings.model = picked;
    // First save with a key and still on the fallback model → pick the newest Flash automatically
    if (!settings.modelPicked && settings.apiKey && picked === FALLBACK_MODEL) {
      try { const models = await fetchModels(); settings.model = pickDefaultModel(models); } catch {}
    }
    Settings.save(settings);
    toast('Saved');
    go('');
  };
  $('btnForget').onclick = () => { settings.apiKey = ''; Settings.forgetKey(); $('apiKeyInput').value = ''; toast('Key removed from this device'); };
  $('btnExport').onclick = async () => {
    const data = { app: 'recap', version: 1, exportedAt: new Date().toISOString(), videos: await DB.all() };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const name = `recap-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  $('btnImport').onclick = () => $('importFile').click();
  $('importFile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      const vids = Array.isArray(data) ? data : data.videos;
      if (!Array.isArray(vids)) throw new Error('Not a Recap backup');
      let n = 0;
      for (const v of vids) { if (v && v.id) { if (['queued', 'transcribing', 'summarizing'].includes(v.status)) v.status = v.summaries?.standard ? 'done' : 'error'; await DB.put(v); n++; } }
      await loadRecords();
      toast(`Imported ${n} recaps`);
    } catch (err) { toast('Import failed: ' + err.message); }
    e.target.value = '';
  };
}

/* ---------- Live updates ---------- */
listeners.add((type, id, extra) => {
  if (type === 'live') {
    if (currentView === 'detail' && location.hash === `#v/${id}` && liveEl) {
      liveEl.textContent = (extra || '').slice(-600);
      liveEl.scrollTop = liveEl.scrollHeight;
    }
    return;
  }
  // 'change': re-render the relevant view
  if (currentView === 'home') renderList($('search')?.value || '');
  else if (currentView === 'detail' && location.hash === `#v/${id}`) {
    const rec = byId(id);
    if (!rec) return;
    // Keep header (title/meta may change) and body in sync
    renderDetail(id);
  }
});

/* ---------- Boot ---------- */
async function loadRecords() {
  records = (await DB.all()).sort((a, b) => b.createdAt - a.createdAt);
  // Jobs interrupted by a reload
  for (const r of records) {
    if (['queued', 'transcribing', 'summarizing'].includes(r.status)) {
      if (r.summaries?.standard) { r.status = 'done'; }
      else { r.status = 'error'; r.error = 'Interrupted (the app was closed or reloaded). Tap Retry.'; }
      r.live = ''; r.summarizing = '';
      await DB.put(r);
    }
  }
}
async function boot() {
  await DB.open();
  await loadRecords();
  $("btnHome").onclick = () => go("");
  $("btnBack").onclick = () => go("");
  $('btnSettings').onclick = () => go(currentView === 'settings' ? '' : '#settings');
  window.addEventListener('hashchange', render);
  render();
  if (!settings.apiKey && !records.length) go('#settings');
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}
boot();
