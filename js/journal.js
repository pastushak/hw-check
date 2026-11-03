// ════════ ЖУРНАЛ ПЕРЕВІРОК ════════

let journalRows = [];
async function loadJournal(){
  $('jrBody').innerHTML = '<div class="empty">Завантаження…</div>';
  const { data, error } = await sb.from('hw_checks')
    .select('id, created_at, student_name, kind, paragraph, test_no, problems, verdict, cost_usd, photos')
    .order('created_at', {ascending:false}).limit(500);
  if(error){ $('jrBody').innerHTML = `<div class="empty">${esc(error.message)}</div>`; return; }
  journalRows = data || []; renderJournal();
}
function renderJournal(){
  const q = $('jrSearch').value.trim().toLowerCase();
  const rows = journalRows.filter(r=>!q || r.student_name.toLowerCase().includes(q));
  if(!rows.length){ $('jrBody').innerHTML = '<div class="empty">Записів немає.</div>'; return; }
  $('jrBody').innerHTML = rows.map(r=>{
    const what = r.kind==='test' ? `Тест ${r.test_no}` : `§${r.paragraph} ${esc(r.problems||'')}`;
    const vcls = r.verdict==='зараховано' ? 'ok' : 'bad';
    const extra = [r.photos?.length ? `📷 ${r.photos.length}` : '', r.cost_usd ? fmtUsd(r.cost_usd) : ''].filter(Boolean).join(' · ');
    return `<div class="list-item" data-id="${r.id}">
      <div><b>${esc(r.student_name)}</b> · ${what}<br><small class="muted">${new Date(r.created_at).toLocaleString('uk-UA')}${extra ? ' · '+extra : ''}</small></div>
      <span class="pill ${vcls}">${esc(r.verdict||'—')}</span></div>`;
  }).join('');
}
$('jrSearch').oninput = renderJournal;
$('jrReload').onclick = loadJournal;

$('jrBody').onclick = async e=>{
  const it = e.target.closest('.list-item'); if(!it || running) return;
  const id = +it.dataset.id;
  const [{ data:chk }, { data:items }] = await Promise.all([
    sb.from('hw_checks').select('*').eq('id', id).single(),
    sb.from('hw_items').select('*').eq('check_id', id).order('id')
  ]);
  if(!chk) return;
  resetCheck(true);
  cur = {
    form:{ student:chk.student_name, gender:chk.gender, kind:chk.kind, paragraph:chk.paragraph, test_no:chk.test_no, problems:chk.problems, note:chk.note||'' },
    model:chk.model, effort:chk.effort, system:'', messages:[], ref:null, workImages:[],
    report:chk.report||'', examples:chk.examples||'', aiVerdict:chk.ai_verdict||'',
    usage:{ in:chk.tokens_in||0, out:chk.tokens_out||0, cw:0, cr:0 }, cost:+chk.cost_usd||0, usageIds:[],
    savedId:chk.id, photos:chk.photos || null,
    items:(items||[]).map(x=>({problem:x.problem, status:x.status, error_type:x.error_type||'', comment:x.comment||''}))
  };
  $('nav').querySelector('[data-v="check"]').click();
  $('tabs').style.display=''; $('actions').style.display='';
  show(fullText()); renderConfirm(); $('verdict').value = chk.verdict || '';
  setLive(`Відкрито з журналу: ${chk.student_name}, ${workTitle(cur.form)} (${fmtDate(chk.created_at)}).`);
  $('saveStatus').textContent = 'Статуси можна виправити й зберегти. Уточнення до Claude недоступні — для нового діалогу перевір повторно з фото з архіву.';
  await showArchive(cur.photos);
  window.scrollTo({ top:0, behavior:'smooth' });
};

async function showArchive(paths){
  if(!paths?.length){ $('archive').style.display='none'; return; }
  const urls = await signedUrls(paths);
  $('archiveThumbs').innerHTML = paths.map((p,i)=>urls[p]
    ? `<a class="thumb" href="${esc(urls[p])}" target="_blank" rel="noopener"><img src="${esc(urls[p])}" alt=""><span>${i+1}</span></a>`
    : `<div class="thumb" title="Файл не знайдено"><span>${i+1}</span></div>`).join('');
  $('archive').style.display = '';
}

// Повторна перевірка: фото з архіву → у форму
$('recheck').onclick = async ()=>{
  if(!cur?.photos?.length || running) return;
  const f = cur.form, paths = cur.photos;
  setLive('Завантажую фото з архіву…');
  try{
    const imgs = [];
    for(const p of paths) imgs.push(await downloadImage(p, 2000));
    resetCheck(true);
    fillStudentSelect(f.student);
    $('kind').value = f.kind; $('kind').onchange();
    if(f.kind==='test') $('testNo').value = f.test_no || '';
    else { $('para').value = f.paragraph; $('nums').value = f.problems || ''; }
    $('note').value = f.note || '';
    images.work = imgs; renderThumbs('work');
    updateBankInfo();
    setLive('Фото й параметри роботи підставлено. Перевір налаштування й натисни «Перевірити» — буде створено новий запис у журналі.');
  }catch(e){ setLive('Не вдалося завантажити фото: '+e.message, true); }
};
