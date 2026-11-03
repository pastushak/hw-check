// ════════ СПІЛЬНЕ: клієнт Supabase, довідники, Claude, рендер, фото ════════

const sb = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);
const BUCKET = CONFIG.BUCKET || 'hw';

const PARAS = [
 ["1","Числові вирази. Арифметичні задачі"],
 ["2","Алгебраїчні вирази"],
 ["3","Лінійні рівняння, системи лінійних рівнянь та їх застосування до розв'язування задач"],
 ["4","Відношення та пропорції. Відсотки. Текстові задачі"],
 ["5","Ірраціональні вирази. Степінь з раціональним показником"],
 ["6","Квадратні рівняння. Квадратний тричлен. Системи нелінійних рівнянь. Текстові задачі"],
 ["7","Нерівності. Системи нерівностей"],
 ["8","Модуль. Рівняння та нерівності з модулями"],
 ["9","Ірраціональні рівняння та системи рівнянь. Ірраціональні нерівності"],
 ["10","Показникові рівняння, системи рівнянь та нерівності"],
 ["11","Логарифми. Логарифмічні рівняння, системи рівнянь та нерівності"],
 ["12","Тригонометричні вирази. Тригонометричні рівняння"],
 ["13","Числові послідовності. Арифметична та геометрична прогресії"],
 ["14","Функції"],
 ["15","Похідна функції та її застосування"],
 ["16","Первісна. Інтеграл та його застосування"],
 ["17","Елементи комбінаторики, теорії ймовірностей та статистики"],
 ["18","Геометричні фігури на площині та їх властивості"],
 ["19","Трикутники"],
 ["20","Многокутники"],
 ["21","Коло, круг та їх елементи. Вписані та описані многокутники"],
 ["22","Пряма та площина в просторі"],
 ["23","Многогранники"],
 ["24","Тіла обертання. Комбінації геометричних тіл"],
 ["25","Метод координат. Вектори"],
 ["26","Задачі з параметрами"]
];
const ST = {
  ok:      {ico:'✅', name:'правильно',  cls:'ok'},
  error:   {ico:'❌', name:'помилка',    cls:'bad'},
  partial: {ico:'🟡', name:'частково',   cls:'warn'},
  unclear: {ico:'⚠️', name:'звірити',    cls:'warn'},
  missing: {ico:'⬜', name:'не розв\'язано', cls:''}
};

const $ = id => document.getElementById(id);
const local = {
  get(k, d){ try{ const v = localStorage.getItem(k); return v===null ? d : JSON.parse(v); }catch(e){ return d; } },
  set(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
};
function esc(s){ return String(s ?? '').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function paraName(n){ const p = PARAS.find(x=>+x[0]===+n); return p ? p[1] : ''; }
const ukSort = (a,b)=>String(a).localeCompare(String(b),'uk');
function seqOf(num){ const m = String(num).match(/\.(\d+)/); return m ? +m[1] : (+num || null); }
const sleep = ms => new Promise(r=>setTimeout(r, ms));
function fmtUsd(x){
  const v = +x || 0;
  const s = v === 0 ? '$0' : v < 0.1 ? '$'+v.toFixed(3) : '$'+v.toFixed(2);
  return CONFIG.USD_TO_UAH ? `${s} (≈${(v*CONFIG.USD_TO_UAH).toFixed(v*CONFIG.USD_TO_UAH<10?1:0)} грн)` : s;
}
function fmtDate(d){ return new Date(d).toLocaleDateString('uk-UA', {day:'2-digit', month:'2-digit', year:'numeric'}); }

// ── Supabase віддає максимум 1000 рядків за раз: читаємо сторінками ──
async function fetchAll(build, step=1000){
  const out = [];
  for(let from=0; from<500000; from+=step){
    const { data, error } = await build().range(from, from+step-1);
    if(error) throw error;
    out.push(...(data||[]));
    if(!data || data.length < step) break;
  }
  return out;
}

// ════════ CLAUDE ════════
async function callClaude({ messages, system, model, effort, cache=false, maxTokens=16000, onText, onPhase }){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session) throw new Error('Сесія завершилась — увійди знову.');
  let r;
  try{
    r = await fetch(`${CONFIG.SUPABASE_URL}/functions/v1/${CONFIG.FUNCTION}`, {
      method:'POST',
      headers:{ 'content-type':'application/json', 'Authorization':'Bearer '+session.access_token, 'apikey':CONFIG.SUPABASE_KEY },
      body: JSON.stringify({ model, effort, cache, max_tokens:maxTokens, system, messages })
    });
  }catch(e){ throw new Error('Немає зв\'язку з функцією Claude. Перевір інтернет і що функція «'+CONFIG.FUNCTION+'» існує.'); }

  if(!r.ok){
    let msg = '';
    try{ const j = await r.json(); msg = j.error?.message || j.message || ''; }catch(e){}
    const hint = {
      401:'Сесія завершилась — увійди знову.',
      403:'Цей акаунт не має доступу до функції (не власник).',
      404:`Функцію «${CONFIG.FUNCTION}» не знайдено — перевір назву в config.js.`,
      413:'Запит завеликий — забагато або заважкі фото. Розбий роботу на дві перевірки.',
      429:'Ліміт запитів Claude API — зачекай хвилину.',
      529:'Claude зараз перевантажений — спробуй за хвилину.',
      546:'Функція не вклалася в ліміт ресурсів Supabase — спробуй менше фото за раз.'
    }[r.status];
    if(/credit balance/i.test(msg)) msg = 'На балансі Claude API закінчилися кошти — поповни в platform.claude.com → Billing.';
    throw new Error(`Помилка ${r.status}: ${msg || hint || r.statusText}` + (msg && hint ? `\n${hint}` : ''));
  }

  const reader = r.body.getReader(); const dec = new TextDecoder();
  let buf = '', text = '', stopReason = null, complete = false;
  const usage = { input:0, output:0, cacheWrite:0, cacheRead:0 };
  const handle = ev=>{
    switch(ev.type){
      case 'message_start': {
        const u = ev.message?.usage || {};
        usage.input = u.input_tokens||0; usage.cacheWrite = u.cache_creation_input_tokens||0; usage.cacheRead = u.cache_read_input_tokens||0;
        break; }
      case 'content_block_start':
        onPhase?.(ev.content_block?.type === 'text' ? 'text' : 'thinking'); break;
      case 'content_block_delta':
        if(ev.delta?.type==='text_delta'){ text += ev.delta.text; onText?.(text); } break;
      case 'message_delta':
        if(ev.usage?.output_tokens != null) usage.output = ev.usage.output_tokens;
        if(ev.delta?.stop_reason) stopReason = ev.delta.stop_reason; break;
      case 'message_stop': complete = true; break;
      case 'error': throw new Error('Claude: '+(ev.error?.message || 'помилка під час відповіді'));
    }
  };
  try{
    while(true){
      const { done, value } = await reader.read(); if(done) break;
      buf += dec.decode(value, {stream:true});
      let i;
      while((i = buf.indexOf('\n')) >= 0){
        const line = buf.slice(0,i).trim(); buf = buf.slice(i+1);
        if(!line.startsWith('data:')) continue;
        let ev; try{ ev = JSON.parse(line.slice(5)); }catch(e){ continue; }
        handle(ev);
      }
    }
  }catch(e){
    if(String(e.message).startsWith('Claude:')) throw e;
    // обрив з'єднання посеред відповіді — повертаємо те, що встигло прийти
  }
  const problem = !complete ? 'cut' : (stopReason === 'max_tokens' ? 'max_tokens' : null);
  return { text, usage, stopReason, complete, problem, model };
}

function problemText(problem, sec){
  if(problem === 'cut') return `⚠️ Відповідь обірвалась${sec ? ` на ${sec} с` : ''}. Найчастіше це ліміт часу функції Supabase (150 с на безкоштовному плані). Спробуй «Обдумування: швидко», менше фото за раз або Sonnet замість Opus.`;
  if(problem === 'max_tokens') return '⚠️ Відповідь уперлася в ліміт довжини — кінець міг не вміститися. Спробуй менше задач за раз.';
  return '';
}

function costOf(model, u){
  let p = CONFIG.PRICES[model]; if(!p) return 0;
  if(p.long && (u.input + u.cacheWrite + u.cacheRead) > 100000) p = p.long;
  return (u.input*p.in + u.output*p.out + u.cacheWrite*p.cw + u.cacheRead*p.cr) / 1e6;
}
async function logUsage(purpose, model, u, checkId=null){
  try{
    const { data } = await sb.from('ai_usage').insert({
      purpose, model, input_tokens:u.input, output_tokens:u.output, cache_write_tokens:u.cacheWrite,
      cache_read_tokens:u.cacheRead, cost_usd:+costOf(model,u).toFixed(5), check_id:checkId
    }).select('id').single();
    return data?.id ?? null;
  }catch(e){ return null; }
}

// Лічильник «Claude обдумує… 23 с»
function liveTimer(el){
  const t0 = Date.now(); let phase = 'Надсилаю запит';
  el.classList.remove('warn');
  const tick = ()=>{ el.textContent = `${phase}… ${Math.round((Date.now()-t0)/1000)} с`; };
  tick(); const h = setInterval(tick, 1000);
  return {
    phase(p){ phase = p; tick(); },
    stop(){ clearInterval(h); return Math.round((Date.now()-t0)/1000); }
  };
}

// ════════ РЕНДЕР MARKDOWN + ФОРМУЛ ════════
function renderMd(src){
  const math=[];
  const keep = (tex, display)=>{ math.push({tex, display}); return `@@M${math.length-1}@@`; };
  src = String(src||'')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_,t)=>keep(t,true))
    .replace(/\\\(([\s\S]+?)\\\)/g, (_,t)=>keep(t,false))
    .replace(/\$\$([\s\S]+?)\$\$/g, (_,t)=>keep(t,true))
    .replace(/\$([^\$\n]+?)\$/g, (_,t)=>keep(t,false));
  const html = DOMPurify.sanitize(marked.parse(src));
  return html.replace(/@@M(\d+)@@/g, (_,i)=>{
    const m = math[+i];
    try{ return katex.renderToString(m.tex, {displayMode:m.display, throwOnError:false}); }catch(e){ return esc(m.tex); }
  });
}
function mdInline(s){ return s ? renderMd(s) : '<span class="muted">—</span>'; }

// ════════ LaTeX → звичайний текст (для Telegram) ════════
const TEX_SYM = { cdot:'·', times:'×', div:'÷', pm:'±', mp:'∓', le:'≤', leq:'≤', leqslant:'≤', ge:'≥', geq:'≥', geqslant:'≥',
  ne:'≠', neq:'≠', approx:'≈', infty:'∞', pi:'π', alpha:'α', beta:'β', gamma:'γ', delta:'δ', Delta:'Δ', varphi:'φ', phi:'φ',
  theta:'θ', lambda:'λ', mu:'μ', omega:'ω', Omega:'Ω', sigma:'σ', varepsilon:'ε', epsilon:'ε', angle:'∠', triangle:'△',
  perp:'⊥', parallel:'∥', in:'∈', notin:'∉', cup:'∪', cap:'∩', subset:'⊂', emptyset:'∅', varnothing:'∅', to:'→',
  rightarrow:'→', Rightarrow:'⇒', Leftrightarrow:'⇔', iff:'⇔', implies:'⇒', circ:'°', degree:'°', cdots:'⋯', ldots:'…',
  dots:'…', int:'∫', sum:'Σ', prod:'∏', forall:'∀', exists:'∃', sim:'∼', equiv:'≡', cong:'≅', quad:'  ', qquad:'    ',
  lbrace:'{', rbrace:'}', langle:'⟨', rangle:'⟩', lvert:'|', rvert:'|', vert:'|', mid:'|' };
const TEX_FN = new Set(['sin','cos','tg','ctg','tan','cot','arcsin','arccos','arctg','arcctg','arctan','log','lg','ln','lim','max','min','exp','sgn']);
const TEX_BB = { R:'ℝ', N:'ℕ', Z:'ℤ', Q:'ℚ', C:'ℂ' };
const SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','−':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ','x':'ˣ','k':'ᵏ','m':'ᵐ','a':'ᵃ','b':'ᵇ','c':'ᶜ','t':'ᵗ','°':'°',' ':''};
const SUB = {'0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','o':'ₒ','x':'ₓ','n':'ₙ','k':'ₖ','m':'ₘ','i':'ᵢ','t':'ₜ',' ':''};

function texToText(s){
  let i = 0;
  const readGroup = ()=>{            // {…} або один символ / команда
    while(s[i]===' ') i++;
    if(s[i]==='{'){
      let depth=0, start=++i;
      for(; i<s.length; i++){ if(s[i]==='{') depth++; else if(s[i]==='}'){ if(depth===0) break; depth--; } }
      const inner = s.slice(start, i); i++; return inner;
    }
    if(s[i]==='\\'){ const m = s.slice(i).match(/^\\([A-Za-z]+|.)/); i += m[0].length; return m[0]; }
    return s[i++] ?? '';
  };
  const wrap = x=> /^[\p{L}\p{N}.,°√²³]+$/u.test(x) || /^\(.*\)$/.test(x) ? x : `(${x})`;
  const script = (x, map, mark)=>{ const t = texToText(x); return [...t].every(c=>c in map) ? [...t].map(c=>map[c]).join('') : (t.length===1 ? mark+t : `${mark}(${t})`); };
  let out = '';
  while(i < s.length){
    const c = s[i];
    if(c==='\\'){
      if(s[i+1]==='\\'){ out += '; '; i+=2; continue; }
      const m = s.slice(i).match(/^\\([A-Za-z]+|.)/); i += m[0].length; const cmd = m[1];
      if(['frac','dfrac','tfrac'].includes(cmd)){ const a = texToText(readGroup()), b = texToText(readGroup()); out += `${wrap(a)}/${wrap(b)}`; }
      else if(cmd==='sqrt'){
        let idx = ''; if(s[i]==='['){ const e = s.indexOf(']', i); idx = s.slice(i+1, e); i = e+1; }
        const a = texToText(readGroup()); out += (idx ? script(idx, SUP, '^') : '') + '√' + wrap(a);
      }
      else if(['text','mathrm','mathbf','textbf','textit','operatorname','mathit','boldsymbol'].includes(cmd)) out += texToText(readGroup());
      else if(cmd==='mathbb'){ const a = readGroup(); out += TEX_BB[a] || a; }
      else if(['vec','overrightarrow'].includes(cmd)) out += texToText(readGroup()) + '⃗';
      else if(['overline','bar','hat','widehat','tilde'].includes(cmd)) out += texToText(readGroup());
      else if(['left','right','big','Big','bigl','bigr','Bigl','Bigr','displaystyle','limits','nolimits'].includes(cmd)){
        if(['left','right'].includes(cmd)){ const d = readGroup(); out += d==='.' ? '' : (d.startsWith('\\') ? texToText(d) : d); }
      }
      else if(cmd==='begin' || cmd==='end'){ const env = readGroup(); if(cmd==='begin' && /cases/.test(env)) out += '{ '; }
      else if(cmd in TEX_SYM) out += TEX_SYM[cmd];
      else if(TEX_FN.has(cmd)) out += cmd + (/[A-Za-z0-9(]/.test(s[i]||'') ? ' ' : '');
      else if(/^[,;:! ]$/.test(cmd)) out += cmd==='!' ? '' : ' ';
      else if('{}%$&#_'.includes(cmd)) out += cmd;
      else out += cmd;
      continue;
    }
    if(c==='^'){ i++; out += script(readGroup(), SUP, '^'); continue; }
    if(c==='_'){ i++; out += script(readGroup(), SUB, '_'); continue; }
    if(c==='{' || c==='}'){ i++; continue; }
    if(c==='&' || c==='~'){ out += ' '; i++; continue; }
    out += c; i++;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}
function mdToPlain(md){
  return String(md||'')
    .replace(/\$\$([\s\S]+?)\$\$/g, (_,t)=>'\n'+texToText(t)+'\n')
    .replace(/\$([^\$\n]+?)\$/g, (_,t)=>texToText(t))
    .replace(/^#{1,2}\s+Для учня\s*$/m, '')
    .replace(/^#{1,6}\s+(.*)$/gm, (_,t)=>t.toUpperCase()===t ? t : `▪ ${t}`)
    .replace(/\*\*(.+?)\*\*/g, '$1').replace(/__(.+?)__/g, '$1')
    .replace(/(^|\s)\*(\S.*?)\*(?=\s|$)/g, '$1$2')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/^---+$/gm, '')
    .replace(/\n{3,}/g, '\n\n').trim();
}

// ════════ ФОТО ════════
const images = { work: [], key: [], bank: [] };
const THUMBS = { work:'thumbsWork', key:'thumbsKey', bank:'thumbsBank' };

function loadImage(src){ return new Promise((res, rej)=>{ const im = new Image(); im.onload = ()=>res(im); im.onerror = ()=>rej(new Error('не вдалося відкрити зображення')); im.src = src; }); }
function canvasJpeg(c, q){ const dataUrl = c.toDataURL('image/jpeg', q); return { dataUrl, b64:dataUrl.split(',')[1], w:c.width, h:c.height }; }
async function imageToJpeg(src, max=2000, q=0.88){
  const img = await loadImage(src);
  const k = Math.min(1, max/Math.max(img.width, img.height));
  const c = document.createElement('canvas'); c.width = Math.round(img.width*k); c.height = Math.round(img.height*k);
  const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height); ctx.drawImage(img, 0, 0, c.width, c.height);
  return canvasJpeg(c, q);
}
// довга сторона ≤ 2000 px, JPEG 0.88: почерк читається, запит невеликий
async function resizeImage(file){
  if(/\.(heic|heif)$/i.test(file.name) || /hei[cf]/i.test(file.type)) throw new Error('формат HEIC браузер не відкриває — на iPhone обери «Найсумісніший» (JPG) у Налаштування → Камера → Формати');
  const url = URL.createObjectURL(file);
  try{ return await imageToJpeg(url); } finally{ URL.revokeObjectURL(url); }
}
function parseRange(s, max){
  if(!String(s).trim()) return Array.from({length:max},(_,i)=>i+1);
  const out = [];
  String(s).split(/[,;]+/).forEach(t=>{
    const [a,b] = t.split(/\s*[–-]\s*/).map(x=>parseInt(x));
    if(a && b) for(let i=a;i<=Math.min(b,max);i++) out.push(i); else if(a && a<=max) out.push(a);
  });
  return [...new Set(out)];
}
async function addPdf(file, bucket, range, report){
  if(!window.pdfjsLib) throw new Error('бібліотека PDF не завантажилась');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const pdf = await pdfjsLib.getDocument({ data: await file.arrayBuffer() }).promise;
  let pages = parseRange(range, pdf.numPages);
  const LIMIT = 60;
  if(pages.length > LIMIT){ pages = pages.slice(0, LIMIT); report(`У PDF ${pdf.numPages} сторінок — беру перші ${LIMIT}. Для решти вкажи діапазон.`); await sleep(1500); }
  for(const [i, n] of pages.entries()){
    report(`PDF: сторінка ${i+1} з ${pages.length}…`);
    const page = await pdf.getPage(n);
    const v1 = page.getViewport({ scale:1 });
    const vp = page.getViewport({ scale: Math.min(3, 2000 / Math.max(v1.width, v1.height)) });
    const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,c.width,c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    images[bucket].push({ ...canvasJpeg(c, 0.88), pdfPage:n });
    if(i % 5 === 4) renderThumbs(bucket);
  }
}
async function addFiles(files, bucket, report){
  for(const f of files){
    try{
      if(f.type==='application/pdf' || /\.pdf$/i.test(f.name)){
        await addPdf(f, bucket, bucket==='bank' ? $('bkPdfPages').value : '', report);
      } else if(f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif)$/i.test(f.name)){
        report(`Обробляю ${f.name}…`);
        images[bucket].push(await resizeImage(f));
      }
    }catch(e){ report(`Не вдалося прочитати ${f.name}: ${e.message||e}`); renderThumbs(bucket); return; }
  }
  report(''); renderThumbs(bucket);
}
function setupDrop(dropId, inputId, bucket, report){
  const drop=$(dropId), input=$(inputId);
  drop.onclick = ()=>input.click();
  drop.ondragover = e=>{ e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = ()=>drop.classList.remove('over');
  drop.ondrop = e=>{ e.preventDefault(); drop.classList.remove('over'); addFiles(e.dataTransfer.files, bucket, report); };
  input.onchange = ()=>{ addFiles([...input.files], bucket, report); input.value=''; };
}
function renderThumbs(bucket){
  const box = $(THUMBS[bucket]); box.innerHTML = '';
  images[bucket].forEach((im,i)=>{
    const d = document.createElement('div'); d.className = 'thumb' + (im.failed ? ' failed' : '');
    d.title = im.failed ? 'Не розпізналась — натисни «Розпізнати» ще раз' : '';
    d.innerHTML = `<img src="${im.dataUrl}" alt=""><span>${im.pdfPage ? 'с.'+im.pdfPage : i+1}</span><button title="Прибрати">×</button>`;
    d.querySelector('button').onclick = ()=>{ images[bucket].splice(i,1); renderThumbs(bucket); };
    box.appendChild(d);
  });
}

// ════════ СХОВИЩЕ ════════
async function dataUrlToBlob(dataUrl){ return (await fetch(dataUrl)).blob(); }
async function uploadJpeg(path, dataUrl){
  const { error } = await sb.storage.from(BUCKET).upload(path, await dataUrlToBlob(dataUrl), { contentType:'image/jpeg', upsert:true });
  if(error) throw new Error('сховище: '+error.message);
  return path;
}
async function downloadImage(path, max=2000){
  const { data, error } = await sb.storage.from(BUCKET).download(path);
  if(error) throw new Error('сховище: '+error.message);
  const url = URL.createObjectURL(data);
  try{ return await imageToJpeg(url, max, 0.9); } finally{ URL.revokeObjectURL(url); }
}
async function signedUrls(paths){
  paths = [...new Set(paths.filter(Boolean))];
  if(!paths.length) return {};
  const { data, error } = await sb.storage.from(BUCKET).createSignedUrls(paths, 3600);
  if(error || !data) return {};
  return Object.fromEntries(data.filter(x=>x.signedUrl).map(x=>[x.path, x.signedUrl]));
}

// ════════ ЕКСПОРТ ДЛЯ УЧНЯ ════════
function sheetHtml(md, title, subtitle){
  return `<div class="sheet"><div class="sheet-h"><b>${esc(title)}</b><span>${esc(subtitle)}</span></div><div class="md">${renderMd(md)}</div></div>`;
}
async function sheetToBlob(html){
  if(!window.htmlToImage) throw new Error('бібліотека картинок не завантажилась');
  const stage = $('exportStage'); stage.innerHTML = html;
  try{
    await document.fonts.ready;
    return await htmlToImage.toBlob(stage.firstElementChild, { pixelRatio:2, backgroundColor:'#ffffff' });
  } finally { stage.innerHTML = ''; }
}
async function copyOrDownloadPng(blob, filename){
  try{
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return 'Картинку скопійовано — встав у Telegram (Ctrl+V).';
  }catch(e){
    downloadBlob(blob, filename);
    return 'Картинку завантажено файлом (браузер не дав скопіювати в буфер).';
  }
}
function downloadBlob(blob, filename){
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 5000);
}
function printHtml(html){
  $('printArea').innerHTML = html;
  document.body.classList.add('printing');
  const done = ()=>{ document.body.classList.remove('printing'); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  setTimeout(()=>{ window.print(); setTimeout(done, 500); }, 50);
}
async function copyText(t){ try{ await navigator.clipboard.writeText(t); return true; }catch(e){ return false; } }
function safeFile(s){ return String(s).replace(/[\\/:*?"<>|]+/g,'').replace(/\s+/g,'_').slice(0,60); }

// ════════ МОДАЛЬНЕ ВІКНО ════════
function openModal(html){ $('modalBox').innerHTML = html; $('modal').hidden = false; }
function closeModal(){ $('modal').hidden = true; $('modalBox').innerHTML = ''; }
$('modal').addEventListener('click', e=>{ if(e.target.id==='modal' || e.target.closest('[data-close]')) closeModal(); });
document.addEventListener('keydown', e=>{ if(e.key==='Escape' && !$('modal').hidden) closeModal(); });
