// ════════ СТАТИСТИКА, ВИТРАТИ, ЗВІТ ДЛЯ УЧНЯ ════════

let statItems = [], statChecks = [], statUsage = [];

async function loadStats(){
  $('stBody').innerHTML = '<div class="empty">Завантаження…</div>';
  try{
    [statItems, statChecks, statUsage] = await Promise.all([
      fetchAll(()=>sb.from('hw_items').select('id, check_id, created_at, student_name, paragraph, test_no, problem, status, error_type').order('id')),
      fetchAll(()=>sb.from('hw_checks').select('id, created_at, student_name, kind, paragraph, test_no, problems, verdict, cost_usd').order('id')),
      fetchAll(()=>sb.from('ai_usage').select('id, created_at, purpose, model, cost_usd, check_id').order('id')).catch(()=>[])
    ]);
  }catch(e){ $('stBody').innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const names = [...new Set([...statChecks.map(c=>c.student_name), ...students.filter(s=>s.active).map(s=>s.full_name)])].sort(ukSort);
  const prev = $('stStudent').value;
  $('stStudent').innerHTML = `<option value="">Усі учні</option>` + names.map(n=>`<option${n===prev?' selected':''}>${esc(n)}</option>`).join('');
  renderStats();
}
$('stStudent').onchange = renderStats;
$('stPeriod').onchange = renderStats;
$('stReload').onclick = loadStats;

function periodStart(){
  const v = $('stPeriod').value, now = new Date();
  if(v==='30') return new Date(now - 30*864e5);
  if(v==='month') return new Date(now.getFullYear(), now.getMonth(), 1);
  return null;
}
function inPeriod(rows){ const s = periodStart(); return s ? rows.filter(r=>new Date(r.created_at) >= s) : rows; }

function bar(c){
  const t = c.ok+c.error+c.partial+c.unclear+c.missing || 1;
  const seg = (n,col)=> n ? `<i style="width:${n/t*100}%;background:${col}"></i>` : '';
  return `<div class="bar">${seg(c.ok,'var(--ok)')}${seg(c.partial,'var(--warn)')}${seg(c.unclear,'#9e9e9e')}${seg(c.error,'var(--bad)')}${seg(c.missing,'var(--line)')}</div>`;
}
function countBy(items){
  const c = {ok:0,error:0,partial:0,unclear:0,missing:0,total:0};
  items.forEach(x=>{ c[x.status]=(c[x.status]||0)+1; c.total++; });
  return c;
}
function pct(c){ return c.total ? Math.round(c.ok/c.total*100) : 0; }
function errorTypes(items){
  const errs = {};
  items.filter(x=>x.status!=='ok' && x.error_type).forEach(x=>{
    const k = x.error_type.trim().toLowerCase();
    (errs[k] ||= {name:x.error_type.trim(), n:0, probs:new Set(), studs:new Set()});
    errs[k].n++; errs[k].probs.add(x.problem); errs[k].studs.add(x.student_name);
  });
  return Object.values(errs).sort((a,b)=>b.n-a.n);
}

function renderStats(){
  const who = $('stStudent').value;
  $('stReport').style.display = who ? '' : 'none';
  const items = inPeriod(statItems).filter(x=>!who || x.student_name===who);
  const checks = inPeriod(statChecks).filter(x=>!who || x.student_name===who);
  let html = '';

  if(!items.length){
    html += '<div class="empty">За цей період немає збережених перевірок.</div>';
  } else {
    const all = countBy(items);
    const accepted = checks.filter(c=>c.verdict==='зараховано').length;
    html += `<div class="cards">
      <div class="stat"><b>${checks.length}</b><span>перевірок</span></div>
      <div class="stat"><b>${accepted}</b><span>зараховано</span></div>
      <div class="stat"><b>${all.total}</b><span>задач перевірено</span></div>
      <div class="stat"><b>${pct(all)}%</b><span>правильних</span></div>
    </div>`;

    html += `<h3>По параграфах</h3><div style="overflow-x:auto"><table class="tbl"><tr><th>§</th><th>Тема</th><th>Задач</th><th>✅ %</th><th>❌</th><th>🟡</th><th style="min-width:120px"></th></tr>`;
    PARAS.forEach(([n,t])=>{
      const c = countBy(items.filter(x=>+x.paragraph===+n));
      if(!c.total && who){ html += `<tr class="muted"><td>${n}</td><td>${esc(t)}</td><td colspan="5">—</td></tr>`; return; }
      if(!c.total) return;
      html += `<tr><td>${n}</td><td>${esc(t)}</td><td>${c.total}</td><td><b>${pct(c)}%</b></td><td>${c.error}</td><td>${c.partial}</td><td>${bar(c)}</td></tr>`;
    });
    html += `</table></div>`;

    const errList = errorTypes(items).slice(0,15);
    if(errList.length){
      html += `<h3>Найчастіші типи помилок</h3><div style="overflow-x:auto"><table class="tbl"><tr><th>Тип помилки</th><th>Разів</th>${who?'':'<th>Учнів</th>'}<th>Номери</th></tr>`;
      errList.forEach(e=>{ html += `<tr><td>${esc(e.name)}</td><td>${e.n}</td>${who?'':`<td>${e.studs.size}</td>`}<td class="muted">${esc([...e.probs].slice(0,12).join(', '))}</td></tr>`; });
      html += `</table></div>`;
    }

    const byProb = {};
    items.forEach(x=>{ const k = (x.test_no ? `Тест ${x.test_no}, №` : '') + x.problem; (byProb[k] ||= {name:k, items:[]}).items.push(x); });
    const hard = Object.values(byProb).map(p=>({name:p.name, c:countBy(p.items)}))
      .filter(p=>p.c.error+p.c.partial>0).sort((a,b)=>(b.c.error+b.c.partial)-(a.c.error+a.c.partial)).slice(0,15);
    if(hard.length){
      html += `<h3>${who?'Задачі з помилками':'Найважчі номери (де помиляються найчастіше)'}</h3><div style="overflow-x:auto"><table class="tbl"><tr><th>№</th><th>Спроб</th><th>❌</th><th>🟡</th><th style="min-width:120px"></th></tr>`;
      hard.forEach(p=>{ html += `<tr><td>${esc(p.name)}</td><td>${p.c.total}</td><td>${p.c.error}</td><td>${p.c.partial}</td><td>${bar(p.c)}</td></tr>`; });
      html += `</table></div>`;
    }

    if(!who){
      const names = [...new Set(items.map(x=>x.student_name))].sort(ukSort);
      html += `<h3>По учнях</h3><div style="overflow-x:auto"><table class="tbl"><tr><th>Учень</th><th>Перевірок</th><th>Задач</th><th>✅ %</th><th>Останній §</th><th style="min-width:120px"></th></tr>`;
      names.forEach(n=>{
        const c = countBy(items.filter(x=>x.student_name===n));
        const ch = checks.filter(x=>x.student_name===n).sort((a,b)=>b.created_at.localeCompare(a.created_at));
        html += `<tr><td>${esc(n)}</td><td>${ch.length}</td><td>${c.total}</td><td><b>${pct(c)}%</b></td><td>${ch[0]?.paragraph ? '§'+ch[0].paragraph : '—'}</td><td>${bar(c)}</td></tr>`;
      });
      html += `</table></div>`;
    }
  }

  if(!who) html += costsHtml();
  $('stBody').innerHTML = html;
}

// ── Витрати ──
function costsHtml(){
  if(!statUsage.length) return `<h3>Витрати на Claude</h3><div class="badge">Поки немає даних — витрати записуються з моменту оновлення.</div>`;
  const sum = rows => rows.reduce((s,r)=>s + (+r.cost_usd||0), 0);
  const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const prevStart = new Date(now.getFullYear(), now.getMonth()-1, 1);
  const thisMonth = statUsage.filter(r=>new Date(r.created_at) >= monthStart);
  const prevMonth = statUsage.filter(r=>{ const d = new Date(r.created_at); return d >= prevStart && d < monthStart; });
  const period = inPeriod(statUsage);
  const linked = period.filter(r=>r.check_id);
  const nChecks = new Set(linked.map(r=>r.check_id)).size;
  const PURPOSE = { check:'Перевірки', followup:'Уточнення', examples:'Тренувальні приклади', bank:'Розпізнавання посібника' };
  const MODEL = { 'claude-opus-5-5':'Opus 5.5', 'claude-sonnet-5-5':'Sonnet 5.5', 'claude-haiku-5-5':'Haiku 5.5' };
  const group = (key, names)=>{
    const g = {}; period.forEach(r=>{ (g[r[key]] ||= []).push(r); });
    return Object.entries(g).sort((a,b)=>sum(b[1])-sum(a[1])).map(([k,rows])=>`<tr><td>${esc(names[k]||k)}</td><td>${rows.length}</td><td>${fmtUsd(sum(rows))}</td></tr>`).join('');
  };
  return `<h3>Витрати на Claude</h3>
    <div class="cards">
      <div class="stat"><b>${fmtUsd(sum(thisMonth))}</b><span>цього місяця</span></div>
      <div class="stat"><b>${fmtUsd(sum(prevMonth))}</b><span>минулого місяця</span></div>
      <div class="stat"><b>${fmtUsd(sum(period))}</b><span>за обраний період</span></div>
      <div class="stat"><b>${nChecks ? fmtUsd(sum(linked)/nChecks) : '—'}</b><span>у середньому за збережену перевірку</span></div>
    </div>
    <div class="row" style="flex-wrap:wrap;gap:16px">
      <div style="min-width:260px"><table class="tbl costs"><tr><th>На що</th><th>Запитів</th><th>Сума</th></tr>${group('purpose', PURPOSE)}</table></div>
      <div style="min-width:260px"><table class="tbl costs"><tr><th>Модель</th><th>Запитів</th><th>Сума</th></tr>${group('model', MODEL)}</table></div>
    </div>
    <div class="badge">Оцінка за цінами з config.js; точна сума — у platform.claude.com → Usage.</div>`;
}

// ── Звіт для учня ──
function studentReportMd(who){
  const items = inPeriod(statItems).filter(x=>x.student_name===who);
  const checks = inPeriod(statChecks).filter(x=>x.student_name===who).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  if(!items.length) return '_За цей період немає перевірених робіт._';
  const all = countBy(items);
  const accepted = checks.filter(c=>c.verdict==='зараховано').length;
  const byPara = PARAS.map(([n,t])=>({ n, t, c:countBy(items.filter(x=>+x.paragraph===+n)) })).filter(p=>p.c.total >= 3);
  const good = byPara.filter(p=>pct(p.c) >= 80), weak = byPara.filter(p=>pct(p.c) < 60);
  const errs = errorTypes(items).slice(0,5);
  const perCheck = id => countBy(items.filter(x=>x.check_id===id));
  let md = `- Перевірено робіт: **${checks.length}** (зараховано: ${accepted})\n- Задач: **${all.total}**, правильно: **${pct(all)}%**\n`;
  if(good.length) md += `\n### Що вже добре виходить\n` + good.map(p=>`- §${p.n} ${p.t} — ${pct(p.c)}%`).join('\n') + '\n';
  if(weak.length) md += `\n### Над чим попрацювати\n` + weak.map(p=>`- §${p.n} ${p.t} — ${pct(p.c)}%`).join('\n') + '\n';
  if(errs.length) md += `\n### Типові помилки\n` + errs.map(e=>`- ${e.name} — ${e.n} раз(и)`).join('\n') + '\n';
  md += `\n### Останні роботи\n| Дата | Робота | Правильно | Результат |\n|---|---|---|---|\n` +
    checks.slice(0,8).map(c=>{ const k = perCheck(c.id);
      return `| ${fmtDate(c.created_at)} | ${c.kind==='test' ? 'Тест '+c.test_no : '§'+c.paragraph+(c.problems?' ('+c.problems+')':'')} | ${k.ok} з ${k.total} | ${c.verdict||'—'} |`; }).join('\n');
  return md;
}
$('stReport').onclick = ()=>{
  const who = $('stStudent').value; if(!who) return;
  const periodName = $('stPeriod').selectedOptions[0].textContent.toLowerCase();
  const html = sheetHtml(studentReportMd(who), who, `Мій прогрес у підготовці до НМТ · ${periodName} · станом на ${fmtDate(Date.now())}`);
  openModal(`<h3>Звіт для учня</h3>
    <div class="sheet-preview">${html}</div>
    <div class="actions"><button class="primary" id="srImg">🖼 Копіювати картинку</button><button id="srPng">⬇ Завантажити PNG</button><button id="srPrint">🖨 Друк / PDF</button><button data-close>Закрити</button></div>
    <div class="status" id="srStatus"></div>`);
  const file = `${safeFile(who)}_прогрес.png`;
  $('srImg').onclick = async ()=>{ $('srStatus').textContent='Готую…'; try{ $('srStatus').textContent = await copyOrDownloadPng(await sheetToBlob(html), file); }catch(e){ $('srStatus').textContent = e.message; } };
  $('srPng').onclick  = async ()=>{ $('srStatus').textContent='Готую…'; try{ downloadBlob(await sheetToBlob(html), file); $('srStatus').textContent='Завантажено.'; }catch(e){ $('srStatus').textContent = e.message; } };
  $('srPrint').onclick = ()=>printHtml(html);
};
