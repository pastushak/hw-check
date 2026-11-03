// ════════ НАВІГАЦІЯ І ЗАПУСК ════════

$('nav').onclick = e=>{
  const b = e.target.closest('button[data-v]'); if(!b) return;
  [...$('nav').querySelectorAll('button[data-v]')].forEach(x=>x.classList.toggle('on', x===b));
  ['check','stats','journal','students','bank'].forEach(v=>$('v-'+v).style.display = v===b.dataset.v ? '' : 'none');
  if(b.dataset.v==='stats') loadStats();
  if(b.dataset.v==='journal') loadJournal();
  if(b.dataset.v==='students') loadStudents();
  if(b.dataset.v==='bank') loadBankCoverage();
};

// попередження, якщо намагаються закрити сторінку з незбереженою перевіркою
window.addEventListener('beforeunload', e=>{
  if(running || (cur && cur.report && !cur.savedId)){ e.preventDefault(); e.returnValue = ''; }
});

initAuth();
