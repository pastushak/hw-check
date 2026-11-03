// ════════ БАНК ЗАДАЧ ════════

setupDrop('dropBank','fileBank','bank', t=>{ $('bkStatus').textContent = t; });
PARAS.forEach(([n,t])=>{ const o=document.createElement('option'); o.value=n; o.textContent=`§${n}. ${t}`; $('bkPara').appendChild(o); });
$('bkModel').value = local.get('bkModel','claude-opus-5-5');
$('bkModel').onchange = ()=>local.set('bkModel', $('bkModel').value);
function bkSync(){
  const test = $('bkKind').value==='test', ans = $('bkMode').value==='ans';
  $('bkParaWrap').style.display = (!test && !ans) ? '' : 'none';
  $('bkTestWrap').style.display = test ? '' : 'none';
  $('bkPageWrap').style.display = ans ? 'none' : '';
  $('bkAnsHint').style.display = (ans && !test) ? '' : 'none';
  $('bkFigHint').style.display = ans ? 'none' : '';
}
$('bkKind').onchange = bkSync; $('bkMode').onchange = bkSync; bkSync();

const BK_COND = `Ти переписуєш задачі з фото сторінок українського посібника з математики для підготовки до НМТ. Не розв'язуй задачі — лише точно переписуй.

Формат відповіді — ТІЛЬКИ такі блоки, без вступу й пояснень:
@@@ <номер>
РИСУНОК: <короткий опис рисунка: що зображено, позначення, відомі дані> || x1,y1,x2,y2
<умова задачі>

Правила:
- Рядок РИСУНОК — лише якщо до задачі є рисунок. Після «||» — рамка рисунка в пікселях ЦЬОГО зображення (лівий верхній і правий нижній кут, цілі числа, розмір зображення вказано в запиті). Рамка має охоплювати весь рисунок з підписами, але не текст умови.
- Номер пиши повністю, як у посібнику (напр. 19.24). Для тестів — номер завдання (1, 2, 3…).
- Умову переписуй дослівно, українською. Усі формули, дроби, степені, корені, нерівності — у LaTeX між $...$.
- Підпункти 1), 2) або а), б) лишай всередині однієї задачі, кожен з нового рядка.
- Для тестів переписуй варіанти відповідей (А–Д) і таблиці відповідності повністю.
- Якщо задача обрізана краєм фото — допиши в кінці умови [обрізано].
- Якщо фрагмент нерозбірливий — [нерозбірливо], не вгадуй.
- Пропусти теоретичний текст, приклади з розв'язаннями й заголовки — лише нумеровані задачі.`;

const BK_ANS = `Ти переписуєш відповіді з фото сторінок «Відповіді» українського посібника з математики. Не розв'язуй — лише точно переписуй.

Формат — ТІЛЬКИ рядки виду (без вступу й пояснень):
<номер> :: <відповідь>

Правила:
- Номер повністю, як у посібнику (напр. 19.24). Для тестів — номер завдання (1, 2, 3…).
- Відповідь дослівно; формули в LaTeX між $...$; кілька підпунктів — в один рядок через «; » (напр. 1) $2$; 2) $-3$).
- Для відповідностей тестів: 1-В, 2-А, 3-Д.
- Переписуй усі відповіді, видимі на фото. Нерозбірливе — [нерозбірливо].`;

function parseCondBlocks(t){
  return String(t||'').split(/^@@@\s*/m).slice(1).map(b=>{
    const lines = b.split('\n');
    const number = lines.shift().trim().replace(/[.\s]+$/,'');
    let figure = '', box = null; const cond = [];
    lines.forEach(l=>{
      const m = l.match(/^\s*РИСУНОК:\s*(.*?)\s*(?:\|\|\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*)?$/);
      if(m && !figure){ figure = m[1].trim() || 'рисунок'; if(m[2]) box = [m[2],m[3],m[4],m[5]].map(Number); }
      else cond.push(l);
    });
    return { number, condition: cond.join('\n').trim(), has_figure: !!figure, figure_note: figure, box };
  }).filter(x=>x.number);
}
function parseAnsLines(t){
  return String(t||'').split('\n').map(l=>l.match(/^\s*([\d.]+?)\.?\s*::\s*(.+)$/)).filter(Boolean)
    .map(m=>({ number:m[1], answer:m[2].trim() }));
}

// Вирізаємо рисунок зі сторінки за рамкою від Claude (з невеликим запасом)
async function cropFigure(page, box){
  if(!box) return null;
  let [x1,y1,x2,y2] = box;
  if(x2 < x1) [x1,x2] = [x2,x1];
  if(y2 < y1) [y1,y2] = [y2,y1];
  const W = page.w, H = page.h;
  if(!W || !H || x2-x1 < 30 || y2-y1 < 30 || x1 >= W || y1 >= H) return null;
  if((x2-x1)*(y2-y1) > 0.85*W*H) return null;          // «рисунок» на всю сторінку — підозріло
  const pad = Math.round(0.02*Math.max(W,H));
  x1 = Math.max(0, x1-pad); y1 = Math.max(0, y1-pad); x2 = Math.min(W, x2+pad); y2 = Math.min(H, y2+pad);
  const img = await loadImage(page.dataUrl);
  const k = Math.min(1, 1200/Math.max(x2-x1, y2-y1));
  const c = document.createElement('canvas'); c.width = Math.round((x2-x1)*k); c.height = Math.round((y2-y1)*k);
  const ctx = c.getContext('2d'); ctx.fillStyle='#fff'; ctx.fillRect(0,0,c.width,c.height);
  ctx.drawImage(img, x1, y1, x2-x1, y2-y1, 0, 0, c.width, c.height);
  return canvasJpeg(c, 0.9).dataUrl;
}

let bkDraft = null;   // {mode, kind, test_no, paragraph, items:[]}
$('bkRun').onclick = async ()=>{
  if(!images.bank.length){ $('bkStatus').textContent = 'Додай фото сторінок.'; return; }
  const mode = $('bkMode').value, kind = $('bkKind').value;
  const test_no = kind==='test' ? (parseInt($('bkTest').value)||null) : null;
  if(kind==='test' && !test_no){ $('bkStatus').textContent = 'Вкажи номер тесту.'; return; }
  const askBase = mode==='cond'
    ? (kind==='test' ? `Перепиши всі завдання Тесту №${test_no}, видимі на цій сторінці.` : `Перепиши всі задачі з цієї сторінки (параграф §${$('bkPara').value}).`)
    : (kind==='test' ? `Перепиши відповіді до Тесту №${test_no}, видимі на цій сторінці.` : 'Перепиши всі відповіді з цієї сторінки.');
  const startPage = parseInt($('bkPage').value) || null;
  const model = $('bkModel').value;
  const queue = images.bank.map((im, idx)=>({ im, idx }));
  const results = new Array(queue.length);
  const failedIdx = new Set();
  let done = 0, cost = 0;
  $('bkRun').disabled = true;
  const tick = ()=>{ $('bkStatus').textContent = `Claude розпізнає… сторінок готово ${done} з ${results.length}` + (failedIdx.size?` · помилок: ${failedIdx.size}`:''); };
  tick();
  async function worker(){
    while(queue.length){
      const { im, idx } = queue.shift();
      try{
        const ask = mode==='cond' ? `${askBase}\nРозмір цього зображення: ${im.w}×${im.h} пікселів.` : askBase;
        const res = await callClaude({ messages:[{role:'user', content:[
          {type:'image', source:{type:'base64', media_type:'image/jpeg', data:im.b64}}, {type:'text', text:ask}]}],
          system: mode==='cond' ? BK_COND : BK_ANS, model, maxTokens:12000 });
        cost += costOf(model, res.usage); logUsage('bank', model, res.usage);
        if(res.problem) throw new Error('обірвана відповідь');
        const items = mode==='cond' ? parseCondBlocks(res.text) : parseAnsLines(res.text);
        for(const x of items){
          x.page = startPage ? startPage + idx : (im.pdfPage ?? null);
          if(mode==='cond' && x.has_figure) x.figure = await cropFigure(im, x.box);
        }
        results[idx] = items;
      }catch(e){ failedIdx.add(idx); results[idx] = []; console.error(e); }
      done++; tick();
    }
  }
  try{
    await Promise.all([worker(), worker(), worker()]);
    // Нове розпізнане + те, що вже чекає в попередньому перегляді (якщо розділ той самий)
    const same = bkDraft && bkDraft.mode===mode && bkDraft.kind===kind && bkDraft.test_no===test_no;
    const merged = new Map((same ? bkDraft.items : []).map(x=>[x.number, x]));
    const len = o => (o.condition ?? o.answer ?? '').replace(/\[обрізано\]/g,'').length;
    results.flat().forEach(x=>{ const prev = merged.get(x.number); if(!prev || len(x) > len(prev)) merged.set(x.number, x); });
    const items = [...merged.values()].sort((a,b)=>{
      const [pa,sa] = String(a.number).split('.').map(Number), [pb,sb2] = String(b.number).split('.').map(Number);
      return (pa-pb) || ((sa||0)-(sb2||0));
    });
    if(mode==='ans' && kind==='hw') items.forEach(x=>{ x.bad = !/^\d+\.\d+$/.test(x.number); });

    // у списку фото лишаються тільки ті сторінки, що не вдалися
    images.bank = images.bank.filter((im, idx)=>failedIdx.has(idx)).map(im=>({ ...im, failed:true }));
    renderThumbs('bank');

    if(!items.length){ $('bkStatus').textContent = 'Нічого не розпізнано. Спробуй чіткіше фото.' + (failedIdx.size ? ` Сторінок з помилкою: ${failedIdx.size}.` : ''); return; }
    bkDraft = { mode, kind, test_no, paragraph: kind==='hw' ? +$('bkPara').value : Math.ceil(test_no/2), items };
    if(mode==='ans'){
      let q = sb.from('problems').select('number, condition, answer').eq('kind', kind).in('number', items.map(x=>x.number));
      if(kind==='test') q = q.eq('test_no', test_no);
      const { data } = await q;
      const m = Object.fromEntries((data||[]).map(r=>[r.number, r]));
      items.forEach(x=>{ x.existing = m[x.number] || null; });
    }
    renderDraft();
    const figs = items.filter(x=>x.figure).length, figMiss = items.filter(x=>x.has_figure && !x.figure).length;
    $('bkStatus').textContent = `Розпізнано: ${items.length}` + (figs ? ` · рисунків вирізано: ${figs}` : '') + (figMiss ? ` · без зображення рисунка: ${figMiss}` : '') + ` · ${fmtUsd(cost)}` +
      (failedIdx.size ? `\n⚠️ Не вдалося: ${failedIdx.size} стор. — вони лишились у списку фото (з червоною рамкою). Натисни «Розпізнати» ще раз — результат додасться до перегляду.` : '');
  }catch(e){ $('bkStatus').textContent = e.message; }
  finally{ $('bkRun').disabled = false; }
};

function renderDraft(){
  $('bkPreviewWrap').style.display = bkDraft ? '' : 'none';
  if(!bkDraft) return;
  const d = bkDraft;
  $('bkPreview').innerHTML = d.items.map((x,i)=> d.mode==='cond' ? `
    <div class="pc" data-i="${i}">
      <div class="head"><input type="text" class="num" data-f="number" value="${esc(x.number)}" style="width:90px">
        <label class="check" style="margin:0"><input type="checkbox" data-f="has_figure"${x.has_figure?' checked':''}> рисунок</label>
        ${x.page ? `<span class="badge">с. ${x.page}</span>` : ''}
        <span style="flex:1"></span><button class="small" data-rm title="Прибрати">×</button></div>
      <div class="twocol">
        <textarea data-f="condition">${esc(x.condition)}</textarea>
        <div class="render" data-r="condition">${mdInline(x.condition)}</div>
      </div>
      <div data-figwrap style="${x.has_figure?'':'display:none'}">
        <input type="text" data-f="figure_note" value="${esc(x.figure_note)}" placeholder="опис рисунка" style="margin-top:6px">
        <div class="fig">${x.figure ? `<img src="${x.figure}" alt="рисунок">` : '<span class="badge">Зображення рисунка немає</span>'}
          <div>${x.figure ? '<button class="small" data-figrm>Прибрати зображення</button><br>' : ''}<button class="small" data-figfile style="margin-top:4px">${x.figure ? 'Замінити' : 'Додати'} з файлу</button></div></div>
      </div>
    </div>` : `
    <div class="pc${x.bad?' bad':''}" data-i="${i}">
      <div class="head"><input type="text" class="num" data-f="number" value="${esc(x.number)}" style="width:90px">
        <input type="text" data-f="answer" value="${esc(x.answer)}" style="flex:1">
        <button class="small" data-rm title="Прибрати">×</button></div>
      <div class="twocol">
        <div class="render" data-r="answer">${mdInline(x.answer)}</div>
        <div class="badge">${x.bad ? '⚠️ номер без параграфа (має бути напр. 19.24) — виправ, інакше не збережеться' :
          x.existing ? (x.existing.answer && x.existing.answer!==x.answer ? '⚠️ у банку інша відповідь: '+esc(x.existing.answer) : (x.existing.condition ? '✓ умова є в банку' : 'у банку лише номер')) : 'умови ще немає — створиться запис лише з відповіддю'}</div>
      </div>
    </div>`).join('');
}
let figTarget = null;   // {item, onDone}
$('bkPreview').addEventListener('input', e=>{
  const el = e.target, card = el.closest('.pc'); if(!card || !el.dataset.f) return;
  const x = bkDraft.items[+card.dataset.i], f = el.dataset.f;
  x[f] = el.type==='checkbox' ? el.checked : el.value;
  if(f==='has_figure') card.querySelector('[data-figwrap]').style.display = el.checked ? '' : 'none';
  if(f==='number' && bkDraft.mode==='ans' && bkDraft.kind==='hw'){ x.bad = !/^\d+\.\d+$/.test(x.number.trim()); card.classList.toggle('bad', x.bad); }
  const r = card.querySelector(`[data-r="${f}"]`); if(r) r.innerHTML = mdInline(x[f]);
});
$('bkPreview').addEventListener('click', e=>{
  const card = e.target.closest('.pc'); if(!card) return;
  const x = bkDraft.items[+card.dataset.i];
  if(e.target.closest('[data-rm]')){ bkDraft.items.splice(+card.dataset.i, 1); renderDraft(); }
  else if(e.target.closest('[data-figrm]')){ x.figure = null; renderDraft(); }
  else if(e.target.closest('[data-figfile]')){ figTarget = { onDone: url=>{ x.figure = url; x.has_figure = true; renderDraft(); } }; $('figFile').click(); }
});
$('figFile').onchange = async ()=>{
  const f = $('figFile').files[0]; $('figFile').value = '';
  if(!f || !figTarget) return;
  try{ const im = await resizeImage(f); const small = await imageToJpeg(im.dataUrl, 1200, 0.9); figTarget.onDone(small.dataUrl); }
  catch(e){ alert('Не вдалося відкрити файл: '+e.message); }
  figTarget = null;
};
$('bkClear').onclick = ()=>{ images.bank = []; renderThumbs('bank'); $('bkStatus').textContent=''; };
$('bkCancel').onclick = ()=>{ bkDraft = null; renderDraft(); $('bkSaveStatus').textContent=''; };

// Upsert групами з однаковим набором полів — щоб не затерти наявні page / figure_path порожнечею
async function upsertGrouped(rows){
  const groups = {};
  rows.forEach(r=>{
    Object.keys(r).forEach(k=>{ if(r[k]===undefined) delete r[k]; });
    const sig = Object.keys(r).sort().join(','); (groups[sig] ||= []).push(r);
  });
  for(const g of Object.values(groups)){
    const { error } = await sb.from('problems').upsert(g, { onConflict:'kind,paragraph,test_no,number' });
    if(error) throw error;
  }
}

$('bkSave').onclick = async ()=>{
  if(!bkDraft) return;
  const d = bkDraft, now = new Date().toISOString();
  const bad = d.items.filter(x=>x.bad);
  const items = d.items.filter(x=>String(x.number).trim() && !x.bad);
  const paraOf = num => d.kind==='hw' ? (parseInt(String(num).split('.')[0]) || d.paragraph) : d.paragraph;
  $('bkSave').disabled = true; $('bkSaveStatus').textContent = 'Зберігаю…';
  try{
    const rows = [];
    for(const x of items){
      const number = String(x.number).trim(), paragraph = paraOf(number);
      if(!(paragraph>=1 && paragraph<=26)) continue;
      const base = { kind:d.kind, paragraph, test_no:d.test_no, number, seq:seqOf(number), updated_at:now };
      if(d.mode==='cond'){
        let figure_path;
        if(x.has_figure && x.figure){
          $('bkSaveStatus').textContent = `Зберігаю рисунок до ${number}…`;
          figure_path = await uploadJpeg(`figures/${d.kind==='test' ? 't'+d.test_no : 'p'+paragraph}/${number}-${Date.now()}.jpg`, x.figure);
        }
        rows.push({ ...base, condition:x.condition.trim(), has_figure:!!x.has_figure,
          figure_note: x.has_figure ? ((x.figure_note||'').trim() || null) : null,
          page: x.page ?? undefined, figure_path, verified:true });
      } else {
        rows.push({ ...base, answer:x.answer.trim() });
      }
    }
    if(!rows.length){ $('bkSaveStatus').textContent = 'Немає що зберігати.' + (bad.length ? ` ${bad.length} відповідей без параграфа в номері.` : ''); return; }
    await upsertGrouped(rows);
    $('bkSaveStatus').textContent = `Збережено: ${rows.length}.` + (bad.length ? ` Пропущено ${bad.length} з номером без параграфа.` : '');
    bkDraft = bad.length ? { ...d, items:bad } : null;
    renderDraft();
    $('bkView').value = d.kind==='test' ? 't'+d.test_no : 'p'+rows[0].paragraph;
    await loadBankCoverage();
  }catch(e){ $('bkSaveStatus').textContent = 'Помилка: '+e.message; }
  finally{ $('bkSave').disabled = false; }
};

// ── Перегляд банку ──
async function loadBankCoverage(){
  let data;
  try{ data = await fetchAll(()=>sb.from('problems').select('id, kind, paragraph, test_no, answer, condition').order('id')); }
  catch(e){ $('bkList').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const cov = {};
  data.forEach(r=>{
    const k = r.kind==='test' ? 't'+r.test_no : 'p'+r.paragraph;
    (cov[k] ||= {n:0, a:0, c:0}); cov[k].n++; if(r.answer) cov[k].a++; if(r.condition) cov[k].c++;
  });
  const prev = $('bkView').value;
  const lbl = (k, title)=> cov[k] ? `${title} — ${cov[k].c} умов, ${cov[k].a} відповідей` : `${title} — порожньо`;
  $('bkView').innerHTML =
    `<optgroup label="Параграфи">${PARAS.map(([n,t])=>`<option value="p${n}">${esc(lbl('p'+n, '§'+n+'. '+t))}</option>`).join('')}</optgroup>` +
    `<optgroup label="Тести">${Array.from({length:50},(_,i)=>i+1).map(n=>`<option value="t${n}">${esc(lbl('t'+n, 'Тест '+n))}</option>`).join('')}</optgroup>`;
  if(prev) $('bkView').value = prev;
  loadBankList();
}
$('bkView').onchange = loadBankList;
$('bkReload').onclick = loadBankCoverage;

let bkRows = [], bkUrls = {};
async function loadBankList(){
  const v = $('bkView').value; if(!v) return;
  let q = sb.from('problems').select('*').order('seq');
  q = v[0]==='t' ? q.eq('kind','test').eq('test_no', +v.slice(1)) : q.eq('kind','hw').eq('paragraph', +v.slice(1));
  const { data, error } = await q;
  if(error){ $('bkList').innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  bkRows = data||[];
  if(!bkRows.length){ $('bkList').innerHTML = '<div class="empty">Тут поки порожньо.</div>'; return; }
  bkUrls = await signedUrls(bkRows.filter(r=>r.has_figure).map(r=>r.figure_path));
  $('bkList').innerHTML = bkRows.map((r,i)=>`
    <div class="pc" data-i="${i}">
      <div class="head"><span class="num">${esc(r.number)}</span>
        ${r.has_figure?'<span class="pill">рисунок</span>':''}${r.page?`<span class="badge">с. ${r.page}</span>`:''}
        ${r.condition && !r.verified ? '<span class="pill warn">неперевірено</span>' : ''}
        <span style="flex:1"></span><button class="small" data-edit>✎</button><button class="small" data-delp title="Видалити">×</button></div>
      <div class="md">${mdInline(r.condition)}</div>
      ${r.has_figure ? `<div class="fig">${bkUrls[r.figure_path] ? `<img src="${esc(bkUrls[r.figure_path])}" alt="рисунок">` : ''}${r.figure_note ? `<div class="badge">${esc(r.figure_note)}</div>` : ''}</div>` : ''}
      <div class="ans">Відповідь: ${r.answer ? '<b>'+renderMd(r.answer).replace(/^<p>|<\/p>\s*$/g,'')+'</b>' : '<span class="muted">немає</span>'}</div>
    </div>`).join('');
}
$('bkList').addEventListener('click', async e=>{
  const card = e.target.closest('.pc'); if(!card) return;
  const r = bkRows[+card.dataset.i];
  if(e.target.closest('[data-delp]')){
    if(!confirm(`Видалити задачу ${r.number} з банку?`)) return;
    await sb.from('problems').delete().eq('id', r.id);
    if(r.figure_path) sb.storage.from(BUCKET).remove([r.figure_path]);
    loadBankCoverage(); return;
  }
  if(e.target.closest('[data-edit]')){
    card.dataset.newfig = '';
    card.innerHTML = `
      <div class="head"><span class="num">${esc(r.number)}</span>
        <label class="check" style="margin:0"><input type="checkbox" data-f="has_figure"${r.has_figure?' checked':''}> рисунок</label></div>
      <div class="twocol"><textarea data-f="condition">${esc(r.condition||'')}</textarea><div class="render" data-r="condition">${mdInline(r.condition)}</div></div>
      <input type="text" data-f="figure_note" value="${esc(r.figure_note||'')}" placeholder="опис рисунка" style="margin-top:6px">
      <div class="fig"><span data-figprev>${r.figure_path && bkUrls[r.figure_path] ? `<img src="${esc(bkUrls[r.figure_path])}" alt="">` : '<span class="badge">зображення рисунка немає</span>'}</span>
        <div><button class="small" data-efigfile>${r.figure_path ? 'Замінити' : 'Додати'} зображення</button>${r.figure_path ? '<br><button class="small" data-efigrm style="margin-top:4px">Прибрати зображення</button>' : ''}</div></div>
      <label>Відповідь</label><input type="text" data-f="answer" value="${esc(r.answer||'')}">
      <div class="actions"><button class="primary" data-savep>Зберегти</button><button data-cancelp>Скасувати</button></div>`;
    card.querySelector('textarea').addEventListener('input', ev=>{ card.querySelector('[data-r="condition"]').innerHTML = mdInline(ev.target.value); });
    return;
  }
  if(e.target.closest('[data-efigfile]')){
    figTarget = { onDone: url=>{ card.dataset.newfig = url; card.querySelector('[data-figprev]').innerHTML = `<img src="${url}" alt="">`; card.querySelector('[data-f="has_figure"]').checked = true; } };
    $('figFile').click(); return;
  }
  if(e.target.closest('[data-efigrm]')){ card.dataset.newfig = 'remove'; card.querySelector('[data-figprev]').innerHTML = '<span class="badge">буде прибрано після збереження</span>'; return; }
  if(e.target.closest('[data-cancelp]')){ loadBankList(); return; }
  if(e.target.closest('[data-savep]')){
    const g = f=>card.querySelector(`[data-f="${f}"]`);
    const upd = { condition:g('condition').value.trim()||null, answer:g('answer').value.trim()||null,
      has_figure:g('has_figure').checked, figure_note:g('figure_note').value.trim()||null, verified:true, updated_at:new Date().toISOString() };
    try{
      const nf = card.dataset.newfig;
      if(nf === 'remove'){ upd.figure_path = null; if(r.figure_path) sb.storage.from(BUCKET).remove([r.figure_path]); }
      else if(nf){
        upd.figure_path = await uploadJpeg(`figures/${r.kind==='test' ? 't'+r.test_no : 'p'+r.paragraph}/${r.number}-${Date.now()}.jpg`, nf);
        if(r.figure_path) sb.storage.from(BUCKET).remove([r.figure_path]);
      }
      const { error } = await sb.from('problems').update(upd).eq('id', r.id);
      if(error) throw error;
      loadBankCoverage();
    }catch(err){ alert('Помилка: '+err.message); }
  }
});
