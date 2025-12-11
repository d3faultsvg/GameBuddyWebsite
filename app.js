// app.js - poprawiona, minimalna wersja (z automatycznym tworzeniem profiles i kontrolą adminLink)
import { supabase } from './supabase.js';

/* helpers */
const $ = id => document.getElementById(id);
const show = (el, msg, err=false) => {
  if (!el) return;
  el.textContent = msg;
  el.className = err ? 'mt-3 text-center text-danger' : 'mt-3 text-center text-success';
};
const esc = s => String(s ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'","&#39;");

/* Ensure profile exists for given user object (user.id from auth) */
async function ensureProfileForUserObject(user, nickname = null) {
  try {
    if (!user || !user.id) return;
    const id = user.id;
    const { data } = await supabase.from('profiles').select('id').eq('id', id).limit(1);
    if (data && data.length > 0) return; // already exists
    // create profile
    await supabase.from('profiles').insert([{ id, email: user.email || null, nickname: nickname || null }]);
    console.log('Profile created for user', id);
  } catch (err) {
    console.error('ensureProfileForUserObject error', err);
  }
}

/* Ensure profile exists for currently logged in session */
async function ensureProfileForCurrentSession() {
  try {
    const { data } = await supabase.auth.getSession();
    const user = data?.session?.user || null;
    if (user) await ensureProfileForUserObject(user);
  } catch (err) {
    console.error('ensureProfileForCurrentSession error', err);
  }
}

/* Auth: sign up & sign in */
async function signUp(email, password, nickname) {
  if (!email || !password || !nickname) return { error: { message: 'Wypełnij pola.' } };
  // check nickname uniqueness
  try {
    const { data: nick } = await supabase.from('profiles').select('id').eq('nickname', nickname).limit(1);
    if (nick && nick.length > 0) return { error: { message: 'Ten nick jest już zajęty.' } };
  } catch (err) {
    console.error('nick check error', err);
  }

  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error };

  // if user returned immediately, create profile
  if (data && data.user) {
    await ensureProfileForUserObject(data.user, nickname);
  } else {
    // If signUp does not return user immediately (magic link), do nothing now.
    console.log('signUp: user may need to confirm email before profile created');
  }
  return { data, error };
}

async function signIn(email, password) {
  return await supabase.auth.signInWithPassword({ email, password });
}

/* Update navbar, show/hide admin link, handle ban */
async function updateAuthUI() {
  try {
    const status = $('login-status');
    const logoutBtn = $('logoutBtn');
    const adminLink = $('adminLink');
    const loginBtnNav = $('loginBtnNav'); // element z nav (link "Zaloguj")

    const { data } = await supabase.auth.getSession();
    const session = data?.session || null;

    // brak sesji — pokaż login, ukryj logout/admin
    if (!session) {
      if (status) status.textContent = '';
      if (logoutBtn) logoutBtn.classList.add('d-none');
      if (adminLink) adminLink.classList.add('d-none');
      if (loginBtnNav) loginBtnNav.classList.remove('d-none');
      return;
    }

    const uid = session.user.id;

    // upewnij się, że profil istnieje (zapobiega błędom przy dodawaniu postów)
    await ensureProfileForUserObject(session.user);

    // pobierz profil
    const { data: prof, error } = await supabase
      .from('profiles')
      .select('nickname,is_admin,banned')
      .eq('id', uid)
      .limit(1)
      .single()
      .maybeSingle();

    if (error) console.warn('profile fetch error', error);

    // jeśli zbanowany — wymuś wylogowanie
    if (prof?.banned) {
      await supabase.auth.signOut();
      if (status) status.textContent = '';
      if (logoutBtn) logoutBtn.classList.add('d-none');
      if (adminLink) adminLink.classList.add('d-none');
      if (loginBtnNav) loginBtnNav.classList.remove('d-none');
      alert('Twoje konto zostało zablokowane.');
      window.location.href = 'index.html';
      return;
    }

    // ustaw status (np. "Witaj, nick")
    if (status) status.textContent = prof?.nickname ? `Witaj, ${prof.nickname}` : session.user.email;

    // pokaż logout, ukryj login link
    if (logoutBtn) logoutBtn.classList.remove('d-none');
    if (loginBtnNav) loginBtnNav.classList.add('d-none');

    // pokaż/ukryj admin link
    if (adminLink) {
      if (prof?.is_admin) adminLink.classList.remove('d-none');
      else adminLink.classList.add('d-none');
    }

    // handler wylogowania
    if (logoutBtn) logoutBtn.onclick = async () => {
      await supabase.auth.signOut();
      await updateAuthUI();
      window.location.href = 'index.html';
    };
  } catch (err) {
    console.error('updateAuthUI error', err);
  }
}


/* Bind auth form (auth.html) */
function bindAuthForm() {
  const loginBtn = $('loginBtn');
  const signupBtn = $('signupBtn');
  const email = $('email');
  const pass = $('password');
  const nickForSign = $('nickForSign');
  const msg = $('message');

  if (loginBtn) {
    loginBtn.addEventListener('click', async () => {
      show(msg, 'Logowanie...', false);
      const res = await signIn(email.value.trim(), pass.value.trim());
      if (res.error) show(msg, '❌ ' + res.error.message, true);
      else {
        show(msg, '✅ Zalogowano');
        // ensure profile exists now
        await ensureProfileForCurrentSession();
        setTimeout(()=>{ updateAuthUI(); window.location.href = 'index.html'; }, 700);
      }
    });
  }

  if (signupBtn) {
    signupBtn.addEventListener('click', async () => {
      show(msg, 'Rejestracja...', false);
      const res = await signUp(email.value.trim(), pass.value.trim(), (nickForSign?.value || '').trim());
      if (res.error) show(msg, '❌ ' + res.error.message, true);
      else {
        show(msg, '✅ Konto utworzone. Sprawdź email, by potwierdzić (jeśli wymagane).');
        // If user was returned and profile created, update UI
        await ensureProfileForCurrentSession();
        setTimeout(()=>updateAuthUI(), 600);
      }
    });
  }
}

/* POSTS */
async function createPost(title, content, gameTypes) {
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) return { error: { message: 'Musisz być zalogowany.' } };

    // ensure profile exists before inserting (prevents FK failure)
    const { data: prof } = await supabase.from('profiles').select('id,banned').eq('id', uid).limit(1).maybeSingle();
    if (!prof) {
      // attempt to create
      await ensureProfileForUserObject(s.session.user);
    } else if (prof.banned) {
      return { error: { message: 'Twoje konto jest zablokowane.' } };
    }

    if (!title || !content) return { error: { message: 'Tytuł i treść wymagane.' } };

    const { error } = await supabase.from('posts').insert([{ user_id: uid, title, content, game_types: gameTypes }]);
    if (error) {
      console.error('createPost insert error', error);
      return { error };
    }
    return {};
  } catch (err) {
    console.error('createPost error', err);
    return { error: { message: 'Błąd serwera.' } };
  }
}

async function loadPosts(containerId='postsList') {
  const container = $(containerId);
  if (!container) return;
  container.innerHTML = '<p class="text-muted">Ładowanie...</p>';
  try {
    const { data, error } = await supabase.from('posts').select('id, title, content, game_types, created_at, user_id').order('created_at', { ascending: false }).limit(500);
    if (error) { container.innerHTML = '<p class="text-danger">Błąd ładowania.</p>'; console.error(error); return; }
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak postów.</p>'; return; }

    
    const userIds = Array.from(new Set(data.map(p => p.user_id).filter(Boolean)));
    let profilesMap = {};
    if (userIds.length) {
      const { data: profs } = await supabase.from('profiles').select('id,nickname').in('id', userIds);
      if (profs) profs.forEach(p => profilesMap[p.id] = p.nickname);
    }

    container.innerHTML = data.map(p => {
      const who = profilesMap[p.user_id] || 'Anonim';
      return `<div class="card mb-2 p-3">
        <div><strong>${esc(p.title||'Bez tytułu')}</strong> <small class="text-muted">— ${esc(who)}</small></div>
        <div class="mt-2">${esc(p.content)}</div>
        <div class="mt-2"><small class="text-muted">${esc(p.game_types || '')}</small></div>
        <div class="mt-2"><button class="btn btn-sm btn-outline-danger" data-del="${p.id}">Usuń</button></div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('loadPosts error', err);
    container.innerHTML = '<p class="text-danger">Błąd ładowania postów.</p>';
  }
}

//prywatne wiadomosci
async function sendPrivateMessage(targetNick, content) {
  try {
    if (!targetNick || !content) return { error: { message: 'Wypełnij pola.' } };
    const { data: rec } = await supabase.from('profiles').select('id,nickname,banned').eq('nickname', targetNick).limit(1).maybeSingle();
    if (!rec) return { error: { message: 'Nie znaleziono użytkownika.' } };
    if (rec.banned) return { error: { message: 'Użytkownik zbanowany.' } };
    const { data: s } = await supabase.auth.getSession();
    const sender = s?.session?.user?.id;
    if (!sender) return { error: { message: 'Musisz być zalogowany.' } };
    const { error } = await supabase.from('private_messages').insert([{ sender, recipient: rec.id, content }]);
    if (error) return { error };
    return {};
  } catch (err) {
    console.error('sendPrivateMessage error', err);
    return { error: { message: 'Błąd wysyłki.' } };
  }
}

async function loadInbox(containerId='inboxList') {
  const container = $(containerId);
  if (!container) return;
  try {
    const { data: s } = await supabase.auth.getSession();
    const uid = s?.session?.user?.id;
    if (!uid) { container.innerHTML = '<p class="text-muted">Zaloguj się, aby zobaczyć wiadomości.</p>'; return; }

    const { data, error } = await supabase.from('private_messages').select('id, content, created_at, sender, recipient').or(`recipient.eq.${uid},sender.eq.${uid}`).order('created_at', { ascending: false }).limit(500);
    if (error) { container.innerHTML = '<p class="text-danger">Błąd ładowania.</p>'; console.error(error); return; }
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak wiadomości.</p>'; return; }

    const ids = Array.from(new Set(data.flatMap(m => [m.sender, m.recipient]).filter(Boolean)));
    let map = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,nickname').in('id', ids);
      if (profs) profs.forEach(p => map[p.id] = p.nickname);
    }

    container.innerHTML = data.map(m => {
      const from = map[m.sender] || m.sender;
      const to = map[m.recipient] || m.recipient;
      return `<div class="card p-2 mb-2">
        <div><small class="text-muted">${new Date(m.created_at).toLocaleString()}</small></div>
        <div class="mt-1"><strong>Od:</strong> ${esc(from)} <strong>Do:</strong> ${esc(to)}</div>
        <div class="mt-2">${esc(m.content)}</div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('loadInbox error', err);
    container.innerHTML = '<p class="text-danger">Błąd ładowania skrzynki.</p>';
  }
}

/* ADMIN helpers (unchanged logic, uses isAdmin check) */
async function isAdmin() {
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data?.session?.user?.id;
    if (!uid) return false;
    const { data: prof } = await supabase.from('profiles').select('is_admin').eq('id', uid).limit(1).maybeSingle();
    return prof?.is_admin === true;
  } catch (err) {
    console.error('isAdmin error', err);
    return false;
  }
}

async function adminLoadMessages(containerId='adminMessages') {
  const container = $(containerId);
  if (!container) return;
  if (!await isAdmin()) { container.innerHTML = '<p class="text-danger">Brak uprawnień.</p>'; return; }
  try {
    const { data } = await supabase.from('private_messages').select('id, content, created_at, sender, recipient').order('created_at', { ascending: false }).limit(1000);
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak wiadomości.</p>'; return; }
    const ids = Array.from(new Set(data.flatMap(m => [m.sender, m.recipient]).filter(Boolean)));
    let map = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,nickname').in('id', ids);
      if (profs) profs.forEach(p => map[p.id] = p.nickname);
    }
    container.innerHTML = data.map(m => `<div class="card p-2 mb-2">
      <div><small class="text-muted">${new Date(m.created_at).toLocaleString()}</small></div>
      <div class="mt-1"><strong>Od:</strong> ${esc(map[m.sender]||m.sender)} <strong>Do:</strong> ${esc(map[m.recipient]||m.recipient)}</div>
      <div class="mt-2">${esc(m.content)}</div>
      <div class="mt-2"><button class="btn btn-sm btn-danger" data-msgdel="${m.id}">Usuń wiadomość</button></div>
    </div>`).join('');
  } catch (err) {
    console.error('adminLoadMessages error', err);
    container.innerHTML = '<p class="text-danger">Błąd ładowania.</p>';
  }
}

async function adminLoadUsers(containerId='adminUsers') {
  const container = $(containerId);
  if (!container) return;
  if (!await isAdmin()) { container.innerHTML = '<p class="text-danger">Brak uprawnień.</p>'; return; }
  try {
    const { data, error } = await supabase.from('profiles').select('id,email,nickname,is_admin,banned,created_at').order('created_at', { ascending: false }).limit(1000);
    if (error) { container.innerHTML = '<p class="text-danger">Błąd.</p>'; console.error(error); return; }
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak użytkowników.</p>'; return; }
    container.innerHTML = data.map(u => `<div class="card p-2 mb-2">
      <div><strong>${esc(u.nickname||u.email)}</strong> <small class="text-muted">${esc(u.email)}</small></div>
      <div class="mt-1">Admin: ${u.is_admin ? 'TAK' : 'NIE'} • Banned: ${u.banned ? 'TAK' : 'NIE'}</div>
      <div class="mt-2"><button class="btn btn-sm btn-danger" data-ban="${u.id}">${u.banned ? 'Odban' : 'Zbanuj'}</button> <button class="btn btn-sm btn-outline-danger" data-deluser="${u.id}">Usuń użytkownika</button></div>
    </div>`).join('');
  } catch (err) {
    console.error('adminLoadUsers error', err);
    container.innerHTML = '<p class="text-danger">Błąd ładowania użytkowników.</p>';
  }
}

async function adminLoadPosts(containerId='adminPosts') {
  const container = $(containerId);
  if (!container) return;
  if (!await isAdmin()) { container.innerHTML = '<p class="text-danger">Brak uprawnień.</p>'; return; }
  try {
    const { data } = await supabase.from('posts').select('id,title,content,created_at,user_id').order('created_at', { ascending: false }).limit(1000);
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak postów.</p>'; return; }
    const ids = Array.from(new Set(data.map(p => p.user_id).filter(Boolean)));
    let map = {};
    if (ids.length) {
      const { data: profs } = await supabase.from('profiles').select('id,nickname').in('id', ids);
      if (profs) profs.forEach(p => map[p.id] = p.nickname);
    }
    container.innerHTML = data.map(p => `<div class="card p-2 mb-2">
      <div><strong>${esc(p.title)}</strong> <small class="text-muted">— ${esc(map[p.user_id]||'Anonim')}</small></div>
      <div class="mt-1">${esc(p.content)}</div>
      <div class="mt-2"><button class="btn btn-sm btn-danger" data-postdel="${p.id}">Usuń post</button></div>
    </div>`).join('');
  } catch (err) {
    console.error('adminLoadPosts error', err);
    container.innerHTML = '<p class="text-danger">Błąd ładowania postów.</p>';
  }
}

/* admin actions */
async function adminToggleBan(userId) {
  if (!await isAdmin()) return { error: { message: 'Brak uprawnień' } };
  const { data } = await supabase.from('profiles').select('banned').eq('id', userId).limit(1).maybeSingle();
  const cur = data?.banned || false;
  const { error } = await supabase.from('profiles').update({ banned: !cur }).eq('id', userId);
  return { error };
}
async function adminDeleteUser(userId) {
  if (!await isAdmin()) return { error: { message: 'Brak uprawnień' } };
  const { error } = await supabase.from('profiles').delete().eq('id', userId);
  return { error };
}
async function adminDeletePost(postId) {
  if (!await isAdmin()) return { error: { message: 'Brak uprawnień' } };
  const { error } = await supabase.from('posts').delete().eq('id', postId);
  return { error };
}
async function adminDeleteMessage(msgId) {
  if (!await isAdmin()) return { error: { message: 'Brak uprawnień' } };
  const { error } = await supabase.from('private_messages').delete().eq('id', msgId);
  return { error };
}

/* Search */
async function searchNick(q, containerId='searchResults') {
  const container = $(containerId);
  if (!container) return;
  if (!q || q.trim().length === 0) { container.innerHTML = '<p class="text-muted">Wpisz nick...</p>'; return; }
  try {
    const { data, error } = await supabase.from('profiles').select('id,nickname,email,type').ilike('nickname', `%${q}%`).limit(50);
    if (error) { container.innerHTML = '<p class="text-danger">Błąd wyszukiwania.</p>'; console.error(error); return; }
    if (!data || data.length === 0) { container.innerHTML = '<p class="text-muted">Brak wyników.</p>'; return; }
    container.innerHTML = data.map(u => `<div class="card p-2 mb-2"><div><strong>${esc(u.nickname)}</strong> <small class="text-muted">${esc(u.email)}</small></div><div class="mt-1"><small>Typ: ${esc(u.type||'—')}</small></div></div>`).join('');
  } catch (err) {
    console.error('searchNick error', err);
    container.innerHTML = '<p class="text-danger">Błąd wyszukiwania.</p>';
  }
}

/* Global click handlers */
function setupClicks() {
  document.addEventListener('click', async ev => {
    const t = ev.target;
    if (!t) return;

    if (t.dataset.del) {
      if (!confirm('Usuń post?')) return;
      const id = t.dataset.del;
      const { error } = await supabase.from('posts').delete().eq('id', id);
      if (error) return alert('Błąd: '+error.message);
      loadPosts('postsList');
      adminLoadPosts('adminPosts');
    }
    if (t.dataset.postdel) {
      if (!confirm('Admin: usuń post?')) return;
      const id = t.dataset.postdel;
      const res = await adminDeletePost(id);
      if (res.error) return alert('Błąd: '+res.error.message);
      adminLoadPosts('adminPosts'); loadPosts('postsList');
    }
    if (t.dataset.msgdel) {
      if (!confirm('Usuń wiadomość?')) return;
      const id = t.dataset.msgdel;
      const res = await adminDeleteMessage(id);
      if (res.error) return alert('Błąd: '+res.error.message);
      adminLoadMessages('adminMessages');
    }
    if (t.dataset.ban) {
      const uid = t.dataset.ban;
      if (!confirm('Zmień stan blokady użytkownika?')) return;
      const res = await adminToggleBan(uid);
      if (res.error) return alert('Błąd: '+res.error.message);
      adminLoadUsers('adminUsers');
    }
    if (t.dataset.deluser) {
      if (!confirm('Usuń konto użytkownika? (nieodwracalne)')) return;
      const uid = t.dataset.deluser;
      const res = await adminDeleteUser(uid);
      if (res.error) return alert('Błąd: '+res.error.message);
      adminLoadUsers('adminUsers');
    }
  });
}

/* Init */
document.addEventListener('DOMContentLoaded', async () => {
  bindAuthForm();
  await ensureProfileForCurrentSession(); // IMPORTANT: ensure profile exists (fix for posts)
  await updateAuthUI();
  setupClicks();

  if ($('postsList')) await loadPosts('postsList');
  if ($('inboxList')) await loadInbox('inboxList');

  if ($('adminMessages')) await adminLoadMessages('adminMessages');
  if ($('adminUsers')) await adminLoadUsers('adminUsers');
  if ($('adminPosts')) await adminLoadPosts('adminPosts');

  // post form binding
  const postForm = $('postForm');
  if (postForm) {
    postForm.addEventListener('submit', async e => {
      e.preventDefault();
      const title = $('postTitle').value.trim();
      const content = $('postContent').value.trim();
      const types = $('postTypes').value.trim();
      const res = await createPost(title, content, types);
      if (res.error) {
        alert('Błąd: ' + (res.error.message || 'Nieznany błąd'));
      } else {
        alert('Ogłoszenie dodane');
        postForm.reset();
        loadPosts('postsList');
      }
    });
  }

  // send message form
  const msgForm = $('sendMsgForm');
  if (msgForm) {
    msgForm.addEventListener('submit', async e => {
      e.preventDefault();
      const nick = $('msgToNick').value.trim();
      const content = $('msgContent').value.trim();
      const res = await sendPrivateMessage(nick, content);
      if (res.error) show($('msgSendResult'), '❌ ' + res.error.message, true);
      else { show($('msgSendResult'), '✅ Wiadomość wysłana'); msgForm.reset(); }
    });
  }

  // search
  const searchForm = $('searchForm');
  if (searchForm) {
    searchForm.addEventListener('submit', async e => {
      e.preventDefault();
      const q = $('searchInput').value.trim();
      await searchNick(q, 'searchResults');
    });
  }
});
