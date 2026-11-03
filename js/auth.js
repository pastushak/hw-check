// ════════ ВХІД, ВІДНОВЛЕННЯ ТА ЗМІНА ПАРОЛЯ ════════

let signedIn = null;
let recoveryPending = /type=recovery/.test(location.hash);

function initAuth(){
  sb.auth.onAuthStateChange((event, session)=>{
    if(event === 'PASSWORD_RECOVERY') recoveryPending = true;
    const on = !!session;
    // setTimeout: Supabase радить не робити запитів усередині цього обробника
    setTimeout(()=>{
      if(on !== signedIn){ signedIn = on; showApp(on); }
      if(on && recoveryPending){
        recoveryPending = false;
        history.replaceState(null, '', location.pathname);
        openPasswordDialog(true);
      }
    }, 0);
  });
}

function showApp(on){
  $('loginView').style.display = on ? 'none' : '';
  $('appView').style.display = on ? '' : 'none';
  if(on) loadStudents();
}

$('lgBtn').onclick = async ()=>{
  $('lgStatus').textContent = 'Вхід…';
  const { error } = await sb.auth.signInWithPassword({ email:$('lgEmail').value.trim(), password:$('lgPass').value });
  $('lgStatus').textContent = error ? 'Помилка: ' + (/invalid login/i.test(error.message) ? 'неправильний email або пароль' : error.message) : '';
};
$('lgPass').addEventListener('keydown', e=>{ if(e.key==='Enter') $('lgBtn').click(); });
$('logout').onclick = ()=>sb.auth.signOut();

$('lgForgot').onclick = async e=>{
  e.preventDefault();
  const email = $('lgEmail').value.trim();
  if(!email){ $('lgStatus').textContent = 'Впиши свій email у поле вище і натисни «Забули пароль?» ще раз.'; return; }
  $('lgStatus').textContent = 'Надсилаю лист…';
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  $('lgStatus').textContent = error
    ? 'Помилка: ' + error.message
    : 'Якщо такий акаунт є — лист уже в дорозі. Посилання з листа відкриє цю сторінку з полем для нового пароля.\n(Якщо посилання веде на localhost — у Supabase → Authentication → URL Configuration вкажи адресу цієї сторінки.)';
};

$('pwBtn').onclick = ()=>openPasswordDialog(false);

function openPasswordDialog(fromRecovery){
  openModal(`
    <h3>${fromRecovery ? 'Задай новий пароль' : 'Змінити пароль'}</h3>
    <label>Новий пароль (мінімум 8 символів)</label><input type="password" id="pw1" autocomplete="new-password">
    <label>Ще раз</label><input type="password" id="pw2" autocomplete="new-password">
    <div class="actions"><button class="primary" id="pwSave">Зберегти</button><button data-close>Скасувати</button></div>
    <div class="status" id="pwStatus"></div>`);
  $('pw1').focus();
  $('pwSave').onclick = async ()=>{
    const a = $('pw1').value, b = $('pw2').value;
    if(a.length < 8){ $('pwStatus').textContent = 'Пароль закороткий — потрібно щонайменше 8 символів.'; return; }
    if(a !== b){ $('pwStatus').textContent = 'Паролі не збігаються.'; return; }
    $('pwSave').disabled = true; $('pwStatus').textContent = 'Зберігаю…';
    const { error } = await sb.auth.updateUser({ password:a });
    $('pwSave').disabled = false;
    if(error){ $('pwStatus').textContent = 'Помилка: ' + error.message; return; }
    $('pwStatus').textContent = 'Пароль змінено ✓ Браузер може запропонувати його зберегти.';
    setTimeout(closeModal, 1500);
  };
}
