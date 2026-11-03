// ════════ ПЕРЕВІРКА РОБОТИ ════════

// ── Форма ──
PARAS.forEach(([n,t])=>{ const o=document.createElement('option'); o.value=n; o.textContent=`§${n}. ${t}`; $('para').appendChild(o); });
$('model').value = local.get('model','claude-sonnet-5-5');
$('model').onchange = ()=>local.set('model', $('model').value);
$('effort').value = local.get('effort','medium');
$('effort').onchange = ()=>local.set('effort', $('effort').value);
$('keepPhotos').checked = local.get('keepPhotos', true);
$('keepPhotos').onchange = ()=>local.set('keepPhotos', $('keepPhotos').checked);
$('kind').onchange = ()=>{
  const t = $('kind').value==='test';
  $('hwFields').style.display = t?'none':'';
  $('testFields').style.display = t?'':'none';
};
$('genEx').onchange = ()=>{ $('exRow').style.display = $('genEx').checked?'':'none'; };

function setStatus(t, warn=false){ $('status').textContent = t; $('status').classList.toggle('warn', warn); }
function setLive(t, warn=false){ $('live').textContent = t; $('live').classList.toggle('warn', warn); }
setupDrop('dropWork','fileWork','work', t=>setStatus(t));
setupDrop('dropKey','fileKey','key', t=>setStatus(t));

function currentForm(){
  const kind = $('kind').value;
  const testNo = parseInt($('testNo').value) || null;
  const s = byName($('student').value);
  return {
    student: $('student').value,
    gender: s?.gender || null,
    kind,
    paragraph: kind==='test' ? (testNo && testNo<=50 ? Math.ceil(testNo/2) : null) : +$('para').value,
    test_no: kind==='test' ? testNo : null,
    problems: kind==='test' ? null : $('nums').value.trim(),
    note: $('note').value.trim()
  };
}

// ── Розбір номерів: "19.2–19.48, 19.53" → ["19.2","19.4",…] ──
function expandNumbers(text, para, evenOnly){
  const out = [];
  const norm = String(text||'').replace(/\s+до\s+/gi,'–').replace(/\.\.+/g,'–').replace(/[—−]/g,'–');
  norm.split(/[,;]+/).map(s=>s.trim()).filter(Boolean).forEach(tok=>{
    const parts = tok.split(/\s*[–-]\s*/).filter(Boolean);
    const parse = s=>{ const m = s.match(/^(?:(\d+)\.)?(\d+)/); return m ? {p: m[1] ? +m[1] : para, n:+m[2]} : null; };
    if(parts.length===2){
      const a = parse(parts[0]), b = parse(parts[1]);
      if(!a || !b) return;
      const p = a.p ?? b.p;
      for(let n=a.n; n<=b.n && n-a.n<400; n++) if(!evenOnly || n%2===0) out.push(`${p}.${n}`);
    } else {
      const a = parse(parts[0]); if(a) out.push(`${a.p}.${a.n}`);
    }
  });
  return [...new Set(out)];
}

// ── Еталон з банку ──
async function fetchReference(f){
  if(f.kind==='test'){
    if(!f.test_no) return { rows:[], missing:[] };
    const { data, error } = await sb.from('problems').select('*').eq('kind','test').eq('test_no', f.test_no).order('seq');
    if(error) throw error;
    return { rows:data||[], missing:[] };
  }
  const wanted = expandNumbers(f.problems, f.paragraph, $('evenOnly').checked);
  if(!wanted.length) return { rows:[], missing:[], wanted };
  const { data, error } = await sb.from('problems').select('*').eq('kind','hw').in('number', wanted).order('paragraph').order('seq');
  if(error) throw error;
  const have = new Set((data||[]).map(r=>r.number));
  return { rows:data||[], missing: wanted.filter(n=>!have.has(n)), wanted };
}
async function loadFigures(rows){
  const withFig = rows.filter(r=>r.has_figure && r.figure_path).slice(0, 12);
  const out = [];
  for(const r of withFig){
    try{ out.push({ number:r.number, img: await downloadImage(r.figure_path, 1200) }); }catch(e){ /* без рисунка — не критично */ }
  }
  return out;
}
function referenceText(ref, f, figs){
  if(!ref.rows.length) return ref.wanted?.length ? `Задано номери: ${ref.wanted.join(', ')}. У банку задач їх ще немає — умови бери лише з фото, не вигадуй.` : '';
  const figSet = new Set(figs.map(x=>x.number));
  const lines = ref.rows.map(r=>{
    let s = `№ ${r.number}. ${r.condition || '(умови немає в банку)'}`;
    if(r.has_figure) s += `\n   [Рисунок: ${r.figure_note || 'є в посібнику'}${figSet.has(r.number) ? '; зображення додано вище' : ''}]`;
    s += `\n   Відповідь з ключа: ${r.answer || '— немає в банку'}`;
    return s;
  });
  let t = `ЕТАЛОН З ПОСІБНИКА (${f.kind==='test' ? 'Тест №'+f.test_no : 'задачі'}):\n` + lines.join('\n\n');
  if(ref.wanted) t = `Задано номери: ${ref.wanted.join(', ')}.\n\n` + t;
  if(ref.missing?.length) t += `\n\nЦих задач у банку ще немає (умову бери лише з фото, не вигадуй): ${ref.missing.join(', ')}.`;
  return t;
}
async function updateBankInfo(){
  const f = currentForm();
  if(f.kind==='hw' && !f.problems){ $('bankInfo').textContent=''; return; }
  try{
    const ref = await fetchReference(f);
    if(f.kind==='test') $('bankInfo').textContent = ref.rows.length ? `З банку: ${ref.rows.length} завдань тесту.` : 'Цього тесту в банку ще немає.';
    else {
      const withAns = ref.rows.filter(r=>r.answer).length, withFig = ref.rows.filter(r=>r.figure_path).length;
      $('bankInfo').textContent = ref.wanted?.length
        ? `Номерів: ${ref.wanted.length} · у банку: ${ref.rows.length} (з відповіддю: ${withAns}${withFig?`, з рисунком: ${withFig}`:''})` + (ref.missing.length ? ` · немає: ${ref.missing.slice(0,8).join(', ')}${ref.missing.length>8?'…':''}` : '')
        : 'Не вдалося розібрати номери.';
    }
  }catch(e){ $('bankInfo').textContent=''; }
}
let bankInfoTimer;
['nums','testNo'].forEach(id=>$(id).addEventListener('input', ()=>{ clearTimeout(bankInfoTimer); bankInfoTimer=setTimeout(updateBankInfo, 500); }));
['para','kind','evenOnly'].forEach(id=>$(id).addEventListener('change', updateBankInfo));

// ── Промпти ──
const CHECK_SYSTEM = `Ти — асистент учителя математики, який готує учнів до НМТ (Україна). Ти перевіряєш рукописні домашні роботи за фото. Остаточне рішення завжди ухвалює вчитель: ти готуєш чернетку вердикту, а не виставляєш оцінку.

Правила перевірки:
- Пиши українською. Формули — у LaTeX між $...$ (рядкові) або $$...$$ (окремий рядок).
- Розбирай кожну задачу окремо. Якщо є фото ключа відповідей — звіряй з ним. Якщо ключа немає — розв'язуй задачу самостійно й звіряй хід розв'язання та відповідь.
- Якщо в запиті є блок «ЕТАЛОН З ПОСІБНИКА» — умови задач беруться ТІЛЬКИ звідти, а відповідь учня звіряй з відповіддю з еталону. Якщо твоє власне розв'язання розходиться з відповіддю еталону — не міняй вердикт мовчки, познач «⚠️» і поясни розбіжність у коментарі (у ключі посібника теж бувають помилки).
- Зображення з підписом «Рисунок до задачі …» — це рисунки з посібника, а не робота учня.
- Для задач, яких немає в еталоні, не вигадуй умов. Якщо умову не видно і відповідь неможливо перевірити однозначно, познач «⚠️ звір з умовою».
- У перевірку включай УСІ задачі з переліку завдання (і з еталону), навіть якщо учень їх не розв'язав — тоді статус ⬜.
- Якщо фрагмент нерозбірливий — познач «⚠️ нерозбірливо» і не вгадуй.
- Розрізняй: правильна відповідь; арифметична помилка/описка; помилка у знаку; концептуальна помилка (неправильне правило/метод); не розв'язано або не доведено до відповіді.
- Звертайся до учня в правильному граматичному роді (стать указано в запиті).
- Шукай повторювані патерни помилок — вони важливіші за окремі описки.

Формат відповіді — суворо в такому порядку:

1) СПЕРШУ службовий блок для бази даних, рівно так (без markdown-огорожі):
===DATA===
{"verdict":"на доопрацювання","items":[{"problem":"2.24","status":"ok","error_type":"","comment":""}]}
===END===
- verdict: "зараховано" або "на доопрацювання".
- items: по одному елементу на КОЖНУ задачу, у порядку номерів.
- status: ok (✅), error (❌), partial (🟡), unclear (⚠️), missing (⬜).
- error_type: коротка узагальнена назва типу помилки (2–5 слів), однакова для однакових помилок; для ok — порожньо.
- comment: до 15 слів, без LaTeX і без зворотних скісних рисок.
- Для тестів problem — номер завдання тесту.

2) ПОТІМ звіт із такими заголовками:

## Для вчителя
### Перевірка по задачах
Таблиця: | № | Відповідь учня | Статус | Коментар |. Статус: ✅ правильно, ❌ помилка, 🟡 частково / описка, ⚠️ звір з умовою / нерозбірливо, ⬜ не розв'язано.
### Патерни помилок
Коротко: які типи помилок повторюються, у яких номерах.
### Чернетка вердикту
Підсумок: X з Y правильно. Пропозиція: «зараховано» або «на доопрацювання» (з одним реченням обґрунтування) і що саме переробити.

## Для учня
Тепле, але конкретне звернення до учня на ім'я (без оцінки). Що вийшло добре; що треба виправити — по пунктах із коротким поясненням правила там, де помилка. Пиши так, щоб учень зрозумів без учителя. Без зайвої води. Тренувальні приклади тут НЕ давай — їх складають окремо.

Якщо в наступних повідомленнях учитель уточнює і статуси змінюються, ПОЧНИ відповідь з повного оновленого блоку ===DATA===. Якщо статуси не змінюються — блок не додавай.`;

const EXAMPLES_SYSTEM = n => `Ти складаєш тренувальні приклади для учня, який готується до НМТ з математики, щоб відпрацювати саме ті помилки, які він зробив у домашній роботі.

Правила:
- Для кожного типу помилки — рівно ${n} нових прикладів того самого типу й складності. Не копіюй задачі з посібника: змінюй числа й формулювання.
- Обирай дані так, щоб відповіді були «чистими» (цілі числа або прості дроби).
- Перш ніж записати відповідь, розв'яжи кожен приклад до кінця і перевір результат (підстановкою або іншим способом). Жодної відповіді навскидку.
- Пиши українською, формули — у LaTeX між $...$.
- Якщо помилок немає — дай 2 приклади підвищеної складності за темою.

Формат — суворо, без вступу:
### Тренувальні приклади
#### <Тип помилки>
1. …
2. …
#### <Наступний тип помилки>
3. …
### Відповіді для самоперевірки
1. …
2. …
(нумерація наскрізна; у відповідях — лише результат, без розв'язання)`;

function workTitle(f){
  return f.kind==='test' ? `Тест №${f.test_no}` : `§${f.paragraph} ${paraName(f.paragraph)}${f.problems ? ', № '+f.problems : ''}`;
}
function buildUserContent(f, ref, figs, work, key){
  const content = [];
  work.forEach((im,i)=>{
    content.push({type:'text', text:`Фото роботи ${i+1}:`});
    content.push({type:'image', source:{type:'base64', media_type:'image/jpeg', data:im.b64}});
  });
  key.forEach((im,i)=>{
    content.push({type:'text', text:`Фото ключа відповідей ${i+1}:`});
    content.push({type:'image', source:{type:'base64', media_type:'image/jpeg', data:im.b64}});
  });
  figs.forEach(x=>{
    content.push({type:'text', text:`Рисунок до задачі ${x.number} (з посібника):`});
    content.push({type:'image', source:{type:'base64', media_type:'image/jpeg', data:x.img.b64}});
  });
  const what = f.kind==='test'
    ? `Тест №${f.test_no ?? '?'} з посібника для підготовки до НМТ (формат НМТ: вибір А–Д, відповідність, відкрита відповідь).`
    : `Параграф §${f.paragraph} «${paraName(f.paragraph)}». Задачі: ${f.problems || 'усі, що на фото'}. Удома учні розв'язують парні номери.`;
  const keyInfo = key.length ? 'додано на фото' : (ref.rows.some(r=>r.answer) ? 'у блоці еталону' : 'не додано — перевіряй самостійним розв\'язанням');
  content.push({type:'text', text:
`Учень: ${f.student} (стать: ${f.gender==='ж' ? 'жіноча' : f.gender==='ч' ? 'чоловіча' : 'не вказано — визнач за ім\'ям'}).
Робота: ${what}
Ключ відповідей: ${keyInfo}.
${f.note ? 'Примітка вчителя: '+f.note : ''}

${referenceText(ref, f, figs)}

Перевір роботу за правилами.`});
  return content;
}

// ── Службовий блок ──
function stripData(t, streaming=false){
  let s = String(t||'').replace(/===DATA===[\s\S]*?===END===\s*/g, '');
  const open = s.indexOf('===DATA===');
  if(open >= 0) s = s.slice(0, open) + (streaming ? '\n\n_Claude заповнює таблицю результатів…_' : '');
  return s.trim();
}
function parseData(t){
  const m = [...String(t||'').matchAll(/===DATA===\s*([\s\S]*?)\s*===END===/g)].pop();
  if(!m) return null;
  try{
    const j = JSON.parse(m[1].replace(/^```(?:json)?|```$/g,'').trim());
    return Array.isArray(j.items) ? j : null;
  }catch(e){ return null; }
}
function splitParts(text){
  const i = text.indexOf('## Для учня');
  return i<0 ? {teacher:text, student:''} : { teacher:text.slice(0,i).trim(), student:text.slice(i).trim() };
}

// ── Показ звіту ──
let cur = null;        // поточна перевірка
let running = false;
let currentTab = 'all';
function fullText(){ return cur ? [cur.report, cur.examples].filter(Boolean).join('\n\n') : ''; }
function show(text){
  const p = splitParts(text);
  const src = currentTab==='teacher' ? p.teacher : currentTab==='student' ? (p.student || '_(ще не готово)_') : text;
  $('out').innerHTML = src ? renderMd(src) : '<div class="empty">…</div>';
}
$('tabs').onclick = e=>{
  const b = e.target.closest('button'); if(!b) return;
  currentTab = b.dataset.t;
  [...$('tabs').children].forEach(x=>x.classList.toggle('on', x===b));
  show(fullText());
};
function lockUi(on){ ['run','fuSend','genExBtn','recheck'].forEach(id=>$(id).disabled = on); }
function addUsage(purpose, res, ids){
  const u = res.usage;
  cur.usage.in += u.input; cur.usage.out += u.output; cur.usage.cw += u.cacheWrite; cur.usage.cr += u.cacheRead;
  const c = costOf(res.model, u); cur.cost += c;
  const target = cur;
  (target.pending ||= []).push(logUsage(purpose, res.model, u, cur.savedId).then(id=>{ if(id) target.usageIds.push(id); }));
  return c;
}

// ── Запуск перевірки ──
$('run').onclick = async ()=>{
  if(running) return;
  const f = currentForm();
  if(!f.student){ setStatus('Обери учня.'); return; }
  if(f.kind==='test' && !f.test_no){ setStatus('Вкажи номер тесту.'); return; }
  if(!images.work.length){ setStatus('Додай хоча б одне фото роботи.'); return; }
  running = true; lockUi(true);
  if(window.innerWidth < 880) $('live').scrollIntoView({ behavior:'smooth', block:'start' });   // на телефоні результат — під формою
  try{
    setStatus(''); setLive('Підтягую умови й рисунки з банку…');
    const ref = await fetchReference(f);
    const figs = await loadFigures(ref.rows);
    const work = [...images.work], key = [...images.key];
    cur = {
      form:f, model:$('model').value, effort:$('effort').value, system:CHECK_SYSTEM,
      messages:[{ role:'user', content: buildUserContent(f, ref, figs, work, key) }],
      ref, workImages:work, report:'', examples:'', items:[], aiVerdict:'',
      usage:{in:0,out:0,cw:0,cr:0}, cost:0, usageIds:[], savedId:null, photos:null
    };
    $('archive').style.display = 'none'; $('saveStatus').textContent = ''; $('verdict').value = '';
    const ok = await runTurn(true);
    if(ok && $('genEx').checked && cur.items.some(x=>x.status!=='ok')) await runExamples();
  }catch(e){
    setLive(e.message, true);
  }finally{ running = false; lockUi(false); }
};

$('fuSend').onclick = async ()=>{
  const t = $('fuText').value.trim();
  if(!t || !cur || !cur.messages.length || running) return;
  running = true; lockUi(true);
  cur.messages.push({ role:'user', content:t }); $('fuText').value='';
  try{ await runTurn(false); } finally{ running = false; lockUi(false); }
};

async function runTurn(isNew){
  $('tabs').style.display=''; $('actions').style.display='none';
  const prev = isNew ? '' : cur.report + '\n\n---\n\n';
  const timer = liveTimer($('live'));
  try{
    const res = await callClaude({
      messages:cur.messages, system:cur.system, model:cur.model, effort:cur.effort, cache:true, maxTokens:24000,
      onPhase: p=>timer.phase(p==='thinking' ? 'Claude обдумує роботу' : 'Claude пише звіт'),
      onText: txt=>show([prev + stripData(txt, true), cur.examples].filter(Boolean).join('\n\n'))
    });
    const sec = timer.stop();
    cur.messages.push({ role:'assistant', content: res.text || '(відповідь порожня)' });
    cur.report = prev + stripData(res.text);
    const cost = addUsage(isNew ? 'check' : 'followup', res);
    const data = parseData(res.text);
    let note = '';
    if(data){
      cur.items = data.items.map(x=>({ problem:String(x.problem??''), status: ST[x.status] ? x.status : 'unclear', error_type:x.error_type||'', comment:x.comment||'' }));
      cur.aiVerdict = data.verdict || cur.aiVerdict;
      if(!cur.savedId) $('verdict').value = '';
    } else if(isNew){
      note = '\nClaude не повернув таблицю для статистики — заповни її вручну нижче.';
    }
    renderConfirm(); show(fullText());
    $('actions').style.display=''; $('followup').style.display='';
    const cacheNote = res.usage.cacheRead ? ` · з кешу ${res.usage.cacheRead} ток.` : '';
    const prob = problemText(res.problem, sec);
    setLive(`${prob ? prob+'\n' : ''}Готово за ${sec} с · ${fmtUsd(cost)} (разом за перевірку ${fmtUsd(cur.cost)})${cacheNote}${note}`, !!prob || !!note);
    return !res.problem;
  }catch(e){
    timer.stop();
    if(!isNew) cur.messages.pop();     // невдале уточнення не лишаємо в історії
    setLive(e.message, true);
    if(isNew) $('out').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
    return false;
  }
}

// ── Тренувальні приклади (окремий, легкий запит без фото) ──
async function runExamples(){
  if(!cur) return;
  const errs = cur.items.filter(x=>x.status!=='ok');
  const f = cur.form;
  const conds = (cur.ref?.rows||[]).filter(r=>errs.some(e=>e.problem===r.number) && r.condition)
    .map(r=>`№ ${r.number}: ${r.condition}`).join('\n');
  const teacher = splitParts(cur.report).teacher;
  const text =
`Учень: ${f.student} (${f.gender==='ж' ? 'учениця' : 'учень'}).
Тема: ${workTitle(f)}.

Задачі з помилками (номер — статус — тип помилки — коментар):
${errs.length ? errs.map(e=>`${e.problem} — ${ST[e.status]?.name||e.status} — ${e.error_type||'—'} — ${e.comment||''}`).join('\n') : 'помилок немає'}
${conds ? '\nУмови цих задач з посібника:\n'+conds : ''}

Висновки вчителя з перевірки:
${teacher.slice(0, 6000)}`;
  const timer = liveTimer($('live'));
  timer.phase('Складаю тренувальні приклади');
  try{
    const res = await callClaude({
      messages:[{ role:'user', content:text }], system:EXAMPLES_SYSTEM($('exCount').value),
      model:cur.model, effort:'medium', maxTokens:12000,
      onText: t=>{ cur.examples = t; show(fullText()); }
    });
    const sec = timer.stop();
    cur.examples = res.text.trim();
    const cost = addUsage('examples', res);
    show(fullText());
    const prob = problemText(res.problem, sec);
    setLive(`${prob ? prob+'\n' : ''}Приклади готові за ${sec} с · ${fmtUsd(cost)} (разом за перевірку ${fmtUsd(cur.cost)})`, !!prob);
  }catch(e){
    timer.stop(); setLive('Приклади не вдалося скласти: '+e.message, true);
  }
}
$('genExBtn').onclick = async ()=>{
  if(!cur || running) return;
  if(!cur.items.length && !cur.report){ setLive('Спершу перевір роботу.', true); return; }
  running = true; lockUi(true);
  try{ cur.examples = ''; await runExamples(); } finally{ running = false; lockUi(false); }
};

// ── Таблиця підтвердження ──
function renderConfirm(){
  $('confirm').style.display = cur ? '' : 'none';
  if(!cur) return;
  $('aiVerdict').textContent = cur.aiVerdict || '—';
  const opts = s=>Object.entries(ST).map(([k,v])=>`<option value="${k}"${k===s?' selected':''}>${v.ico} ${v.name}</option>`).join('');
  $('itemsTbl').innerHTML = `<tr><th>№</th><th>Статус</th><th>Тип помилки</th><th>Коментар</th><th></th></tr>` +
    cur.items.map((it,i)=>`<tr>
      <td><input type="text" data-i="${i}" data-f="problem" value="${esc(it.problem)}" style="width:70px"></td>
      <td><select data-i="${i}" data-f="status">${opts(it.status)}</select></td>
      <td><input type="text" data-i="${i}" data-f="error_type" value="${esc(it.error_type)}"></td>
      <td><input type="text" data-i="${i}" data-f="comment" value="${esc(it.comment)}"></td>
      <td><button class="small" data-del="${i}" title="Прибрати">×</button></td></tr>`).join('');
}
$('itemsTbl').addEventListener('input', e=>{
  const el = e.target; if(el.dataset.i===undefined || !cur) return;
  cur.items[+el.dataset.i][el.dataset.f] = el.value;
});
$('itemsTbl').addEventListener('click', e=>{
  const b = e.target.closest('button[data-del]'); if(!b) return;
  cur.items.splice(+b.dataset.del, 1); renderConfirm();
});
$('addItem').onclick = ()=>{ if(!cur) return; cur.items.push({problem:'', status:'ok', error_type:'', comment:''}); renderConfirm(); };

// ── Збереження ──
let saving = false;
$('saveBtn').onclick = async ()=>{
  if(!cur || saving) return;
  const v = $('verdict').value;
  if(!v){ $('saveStatus').textContent = 'Обери вердикт.'; return; }
  const items = cur.items.filter(x=>String(x.problem).trim()).map(x=>({ ...x, problem:String(x.problem).trim() }));
  if(!items.length){ $('saveStatus').textContent = 'Немає жодної задачі для збереження.'; return; }
  saving = true; $('saveBtn').disabled = true;
  const f = cur.form;
  try{
    if($('keepPhotos').checked && !cur.photos && cur.workImages?.length){
      const folder = `checks/${new Date().toISOString().slice(0,7)}/${crypto.randomUUID()}`;
      const paths = [];
      for(const [i, im] of cur.workImages.entries()){
        $('saveStatus').textContent = `Зберігаю фото в архів: ${i+1} з ${cur.workImages.length}…`;
        const small = await imageToJpeg(im.dataUrl, 1600, 0.75);
        paths.push(await uploadJpeg(`${folder}/${i+1}.jpg`, small.dataUrl));
      }
      cur.photos = paths;
    }
    $('saveStatus').textContent = 'Зберігаю…';
    const p_check = {
      student_name:f.student, gender:f.gender, kind:f.kind, paragraph:f.paragraph, test_no:f.test_no, problems:f.problems,
      model:cur.model, effort:cur.effort, note:f.note || null, report:cur.report, examples:cur.examples || null,
      ai_verdict:cur.aiVerdict || null, verdict:v,
      tokens_in: cur.usage.in + cur.usage.cw + cur.usage.cr, tokens_out: cur.usage.out,
      cost_usd: +cur.cost.toFixed(4), photos: cur.photos
    };
    const { data:id, error } = await sb.rpc('save_check', { p_check, p_items:items, p_id:cur.savedId });
    if(error) throw error;
    cur.savedId = id;
    await Promise.all(cur.pending || []);
    if(cur.usageIds.length) await sb.from('ai_usage').update({ check_id:id }).in('id', cur.usageIds);
    $('saveStatus').textContent = `Збережено ✓ (${items.length} задач${cur.photos ? `, фото в архіві: ${cur.photos.length}` : ''}). Якщо щось зміниш — натисни ще раз, запис оновиться.`;
  }catch(e){
    $('saveStatus').textContent = 'Не вдалося зберегти: '+(e.message||e) + (/save_check/.test(e.message||'') ? '\nСхоже, міграцію бази ще не запущено (supabase/migration-2026-11.sql).' : '');
  }finally{ saving = false; $('saveBtn').disabled = false; }
};

// ── Нова перевірка ──
function resetCheck(keepForm=false){
  cur = null; images.work=[]; images.key=[];
  renderThumbs('work'); renderThumbs('key');
  if(!keepForm) ['nums','testNo','note'].forEach(id=>$(id).value='');
  $('fuText').value='';
  $('out').innerHTML = '<div class="empty">Тут з\'явиться результат перевірки.</div>';
  ['tabs','actions','followup','confirm','archive'].forEach(id=>$(id).style.display='none');
  $('saveStatus').textContent=''; setStatus(''); setLive(''); $('bankInfo').textContent='';
}
$('reset').onclick = ()=>{ if(!running) resetCheck(); };

// ── Для учня: картинка, текст, PDF ──
function studentMd(){
  const p = splitParts(fullText());
  return (p.student || fullText()).replace(/^##\s+Для учня\s*\n?/, '');
}
function studentSheet(){
  const f = cur.form;
  return sheetHtml(studentMd(), f.student, `${workTitle(f)} · ${fmtDate(Date.now())}`);
}
$('exImg').onclick = async ()=>{
  if(!cur) return;
  setLive('Готую картинку…');
  try{
    const blob = await sheetToBlob(studentSheet());
    setLive(await copyOrDownloadPng(blob, `${safeFile(cur.form.student)}_${safeFile(workTitle(cur.form))}.png`));
  }catch(e){ setLive('Не вдалося зробити картинку: '+e.message, true); }
};
$('exText').onclick = async ()=>{
  if(!cur) return;
  const ok = await copyText(mdToPlain(studentMd()));
  setLive(ok ? 'Текст для учня скопійовано — формули записано звичайними символами.' : 'Не вдалося скопіювати.', !ok);
};
$('exPrint').onclick = ()=>{ if(cur) printHtml(studentSheet()); };
$('copyAll').onclick = async ()=>{ const ok = await copyText(fullText()); setLive(ok ? 'Весь звіт скопійовано.' : 'Не вдалося скопіювати.', !ok); };
