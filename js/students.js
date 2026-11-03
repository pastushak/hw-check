// ════════ УЧНІ ════════

let students = [];
const byName = n => students.find(s=>s.full_name===n);

async function loadStudents(){
  const { data, error } = await sb.from('students').select('*').order('full_name');
  if(error){ $('stuStatus').textContent = 'Помилка: '+error.message; return; }
  students = (data||[]).sort((a,b)=>ukSort(a.full_name,b.full_name));
  fillStudentSelect(); renderStudents();
}

function fillStudentSelect(extraName){
  const prev = extraName || $('student').value;
  const active = students.filter(s=>s.active);
  const groups = {};
  active.forEach(s=>{ (groups[s.grp||'Без групи'] ||= []).push(s.full_name); });
  // учень з архіву, якого вже немає серед активних
  if(prev && !active.some(s=>s.full_name===prev)) (groups['Неактивні / архів'] ||= []).push(prev);
  if(!Object.keys(groups).length){ $('student').innerHTML = '<option value="">— спершу додай учнів у вкладці «Учні» —</option>'; return; }
  $('student').innerHTML = '<option value="">— обери —</option>' + Object.keys(groups).sort(ukSort).map(g=>
    `<optgroup label="${esc(g)}">${groups[g].map(n=>`<option${n===prev?' selected':''}>${esc(n)}</option>`).join('')}</optgroup>`
  ).join('');
}

function renderStudents(){
  const list = students.filter(s=>$('showInactive').checked || s.active);
  if(!list.length){ $('stTbl').innerHTML = '<tr><td class="muted">Поки порожньо — додай список ліворуч.</td></tr>'; return; }
  $('stTbl').innerHTML = `<tr><th>Учень</th><th>Стать</th><th>Група</th><th>Активний</th><th></th></tr>` +
    list.map(s=>`<tr data-id="${s.id}"${s.active?'':' class="muted"'}>
      <td><input type="text" data-f="full_name" value="${esc(s.full_name)}"></td>
      <td><select data-f="gender"><option value=""${!s.gender?' selected':''}>—</option><option${s.gender==='ч'?' selected':''}>ч</option><option${s.gender==='ж'?' selected':''}>ж</option></select></td>
      <td><input type="text" data-f="grp" value="${esc(s.grp||'')}"></td>
      <td style="text-align:center"><input type="checkbox" data-f="active"${s.active?' checked':''}></td>
      <td><button class="small" data-del title="Видалити зі списку">×</button></td></tr>`).join('');
}
$('showInactive').onchange = renderStudents;

$('stTbl').addEventListener('change', async e=>{
  const el = e.target, tr = el.closest('tr[data-id]'); if(!tr || !el.dataset.f) return;
  const id = +tr.dataset.id, f = el.dataset.f;
  let val = f==='active' ? el.checked : el.value.trim();
  if(f==='full_name' && !val){ renderStudents(); return; }
  if(f!=='active' && !val) val = null;
  const { error } = await sb.from('students').update({ [f]: val }).eq('id', id);
  $('stuStatus').textContent = error
    ? 'Не збережено: '+(error.code==='23505' ? 'учень з таким іменем уже є' : error.message)
    : (f==='full_name' ? 'Перейменовано ✓ — статистику й журнал перенесено на нове ім\'я.' : 'Збережено ✓');
  await loadStudents();
});

$('stTbl').addEventListener('click', async e=>{
  const b = e.target.closest('button[data-del]'); if(!b) return;
  const s = students.find(x=>x.id===+b.closest('tr').dataset.id);
  if(!confirm(`Видалити «${s.full_name}» зі списку? Збережені перевірки й статистика залишаться.`)) return;
  const { error } = await sb.from('students').delete().eq('id', s.id);
  $('stuStatus').textContent = error ? 'Помилка: '+error.message : 'Видалено.';
  await loadStudents();
});

function parseBulk(text, defGroup){
  return text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean).map(l=>{
    const parts = l.split(/\t|;|,/).map(x=>x.trim());
    const name = parts[0].replace(/\s+/g,' ');
    let gender = null, grp = null;
    parts.slice(1).forEach(p=>{
      const g = p.toLowerCase();
      if(!gender && ['ч','ж','чол','жін','m','f'].includes(g)) gender = (g[0]==='ж'||g==='f') ? 'ж' : 'ч';
      else if(!grp && p) grp = p;
    });
    return { full_name:name, gender, grp: grp || defGroup || null };
  }).filter(s=>s.full_name);
}

$('bulkAdd').onclick = async ()=>{
  const rows = parseBulk($('bulk').value, $('bulkGroup').value.trim());
  if(!rows.length){ $('bulkStatus').textContent = 'Список порожній.'; return; }
  const seen = new Set(); const uniq = rows.filter(r=>!seen.has(r.full_name) && seen.add(r.full_name));
  const fresh = uniq.filter(r=>!byName(r.full_name));
  const skipped = uniq.length - fresh.length;
  if(!fresh.length){ $('bulkStatus').textContent = 'Усі ці учні вже є в списку.'; return; }
  $('bulkAdd').disabled = true;
  const { error } = await sb.from('students').insert(fresh);
  $('bulkAdd').disabled = false;
  if(error){ $('bulkStatus').textContent = 'Помилка: '+error.message; return; }
  const noGender = fresh.filter(r=>!r.gender).length;
  $('bulkStatus').textContent = `Додано: ${fresh.length}.` + (skipped?` Пропущено (вже є): ${skipped}.`:'') + (noGender?` Без статі: ${noGender} — вкажи в таблиці праворуч.`:'');
  $('bulk').value = '';
  await loadStudents();
};
