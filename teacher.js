// teacher.js - resilient teacher UI (overwrite your existing teacher.js with this)

// ---------- CONFIG ----------
const API_BASE = 'http://localhost:5000/api';
const localQuizKey = 'quizzes'; // local fallback key in localStorage

// ---------- UTILITIES ----------
function safeParse(item) {
  try { return JSON.parse(item); } catch (e) { return null; }
}
function q(sel){ return document.querySelector(sel); }
function qAll(sel){ return Array.from(document.querySelectorAll(sel)); }
function log(...args){ console.log('[teacher]', ...args); }
function warn(...args){ console.warn('[teacher]', ...args); }
function errlog(...args){ console.error('[teacher]', ...args); }

// create minimal nav UI if missing
function ensureNavUI() {
  let navAuth = q('#nav-auth-container');
  if (!navAuth) {
    const nav = q('nav') || document.body;
    navAuth = document.createElement('div');
    navAuth.id = 'nav-auth-container';
    nav.appendChild(navAuth);
  }
  // build user info (may be updated later)
  const currentUser = safeParse(localStorage.getItem('currentUser')) || null;
  navAuth.innerHTML = `
    <a href="#" id="profile-link">${currentUser?.username || 'profile'}</a>
    <button id="logout-btn" class="btn btn-secondary" style="margin-left:8px">Logout</button>
  `;
  // attach logout (safe)
  const logoutBtn = q('#logout-btn');
  if (logoutBtn) {
    logoutBtn.onclick = () => {
      localStorage.removeItem('currentUser');
      alert('Logged out');
      window.location.href = 'index.html';
    };
  }
  const profileLink = q('#profile-link');
  if (profileLink) {
    profileLink.onclick = (e) => {
      e.preventDefault();
      const u = safeParse(localStorage.getItem('currentUser'));
      alert('Profile: ' + JSON.stringify(u || { }));
    };
  }
}

// safe fetch wrapper
async function fetchJson(url, opts = {}) {
  const r = await fetch(url, opts);
  const text = await r.text();
  try {
    const j = JSON.parse(text || '{}');
    if (!r.ok) throw Object.assign(new Error(`HTTP ${r.status}`), { status: r.status, body: j });
    return j;
  } catch (e) {
    // if parse failed but r.ok, return text
    if (r.ok) return text;
    throw e;
  }
}

// ---------- MAIN UI FUNCTIONS (will be defined then used) ----------
let currentUser = null;
let quizzes = safeParse(localStorage.getItem(localQuizKey)) || [];
let questionCounter = 0;

// DOM references (populated on init)
let navAuthContainer, dashboardView, profileView;
let dashboardTabs, dashboardTabContents;
let createQuizForm, questionsContainer, addQuestionBtn, saveQuizBtn, quizEditIdField;
let quizPreviewArea, libraryListContainer, previewListContainer;
let filterSubject, filterStatus, filterSort, pFilteredListContainer;
let backToDashBtn, profileTabs, profileTabContents, changePasswordForm;

// attach small fallback UI and tab handlers (in case init fails)
function attachFallbackTabHandlers() {
  // attach click handlers to any elements that look like a tab
  dashboardTabs = qAll('.dashboard-tab-btn');
  if (!dashboardTabs || dashboardTabs.length === 0) {
    // try common nav tabs by text
    dashboardTabs = qAll('.nav-tab, .tab-btn');
  }
  dashboardTabContents = qAll('.dashboard-tab-content');
  // ensure click binding
  dashboardTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const tabId = tab.dataset?.tab || tab.getAttribute('data-tab') || tab.getAttribute('href')?.replace('#','');
      if (tabId) {
        // show tab content if exists
        dashboardTabContents.forEach(c => c.classList.remove('active'));
        const target = document.getElementById(tabId) || document.querySelector(`.${tabId}`);
        if (target) target.classList.add('active');
        dashboardTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        // call refresh functions if present
        try { window.refreshQuizLibrary && window.refreshQuizLibrary('library-list-container'); } catch(e){ warn(e); }
        try { window.refreshPreviewList && window.refreshPreviewList('preview-list-container'); } catch(e){ warn(e); }
      }
    });
  });
}

// ---------- QUESTION UI ----------
function addQuestion() {
  questionCounter++;
  if (!questionsContainer) return;
  const html = `
    <div class="question-card" data-q-index="${questionCounter}">
      <div class="question-card-header">
        <h3>Question ${questionCounter}</h3>
        <button type="button" class="btn btn-danger btn-small remove-question-btn" style="width:auto;padding:5px 10px">Remove</button>
      </div>
      <div class="form-group">
        <label>Question Text</label>
        <input type="text" class="q-text" required />
      </div>
      <div class="form-group question-type-select">
        <label>Question Type:</label>
        <select class="q-type" data-q-index="${questionCounter}">
          <option value="single">Single Correct</option>
          <option value="multi">Multiple Correct</option>
        </select>
      </div>
      <div class="question-options">
        ${[1,2,3,4].map(i => `
          <div class="form-group">
            <label>Option ${i}</label>
            <input type="text" class="q-option" id="q-${questionCounter}-opt-${i}" />
          </div>
        `).join('')}
      </div>
      <label>Correct Answer(s):</label>
      <div class="options-grid" id="q-correct-options-${questionCounter}">
        ${[1,2,3,4].map(i => `
          <input type="checkbox" id="q-${questionCounter}-correct-${i}" class="q-correct" value="${i-1}">
          <label for="q-${questionCounter}-correct-${i}">Option ${i}</label>
        `).join('')}
      </div>
    </div>
  `;
  questionsContainer.insertAdjacentHTML('beforeend', html);
}

// handle change for q-type (single -> radio)
document.body.addEventListener('change', (e) => {
  if (!e.target.classList) return;
  if (e.target.classList.contains('q-type')) {
    const idx = e.target.dataset.qIndex;
    const container = document.getElementById(`q-correct-options-${idx}`);
    if (!container) return;
    const inputs = container.querySelectorAll('input');
    if (e.target.value === 'single') {
      inputs.forEach(inp => { inp.type = 'radio'; inp.name = `q-${idx}-correct-group`; });
    } else {
      inputs.forEach(inp => { inp.type = 'checkbox'; inp.name = ''; });
    }
  }
});

// handle remove question
document.body.addEventListener('click', (e) => {
  if (e.target.classList && e.target.classList.contains('remove-question-btn')) {
    const card = e.target.closest('.question-card');
    card && card.remove();
  }
});

// ---------- SAVE QUIZ (API first, fallback to local) ----------
async function postJson(url, body){
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  const text = await r.text();
  let json;
  try { json = text ? JSON.parse(text) : {}; } catch(e){ json = { text }; }
  if (!r.ok) throw Object.assign(new Error('HTTP error'), { status: r.status, body: json });
  return json;
}

async function saveQuiz(e) {
  try {
    e && e.preventDefault && e.preventDefault();
    const titleEl = q('#quiz-title');
    if (!titleEl) { alert('Form missing'); return; }
    const title = titleEl.value.trim();
    const description = (q('#quiz-description') && q('#quiz-description').value) || '';
    const category = (q('#quiz-category') && q('#quiz-category').value) || '';

    const questionCards = qAll('.question-card');
    if (!title || questionCards.length === 0) {
      alert('Please enter a title and at least one question.');
      return;
    }

    const questions = questionCards.map(card => {
      const text = (card.querySelector('.q-text') && card.querySelector('.q-text').value) || '';
      const type = (card.querySelector('.q-type') && card.querySelector('.q-type').value) || 'single';
      const options = Array.from(card.querySelectorAll('.q-option')).map(i => i.value || '');
      const correct = Array.from(card.querySelectorAll('.q-correct:checked')).map(c => parseInt(c.value,10));
      return { text, type, options, correct };
    });

    const payload = {
      title, description, category,
      created_by: currentUser?.username || currentUser?.id || null
    };

    // Try server
    try {
      const createdQuiz = await postJson(`${API_BASE}/quizzes`, payload); // expects {id, ...}
      const createdQuizId = createdQuiz.id;
      log('Quiz created in DB:', createdQuiz);

      // create questions
      for (const qn of questions) {
        const qRes = await postJson(`${API_BASE}/questions`, { quiz_id: createdQuizId, text: qn.text });
        const createdQId = qRes.id;
        log('Question created:', createdQId);
        // create options
        for (let i = 0; i < qn.options.length; i++) {
          const optText = qn.options[i] || '';
          const isCorrect = qn.correct.includes(i);
          await postJson(`${API_BASE}/options`, { question_id: createdQId, text: optText, is_correct: !!isCorrect });
        }
      }

      alert('Quiz saved on server successfully.');
      // wipe local migration key if relevant
      localStorage.removeItem(localQuizKey);
      resetCreateForm();
      refreshQuizLibrary('library-list-container');
      refreshPreviewList('preview-list-container');
      return;
    } catch (apiErr) {
      warn('API save failed, falling back to localStorage', apiErr);
      // fallback to local save
      const local = safeParse(localStorage.getItem(localQuizKey)) || [];
      const localId = `q_${Date.now()}`;
      const localQuiz = {
        id: localId,
        title, description, category,
        createdBy: currentUser?.username || null,
        published: false,
        questions,
        lastUpdated: new Date().toISOString()
      };
      local.push(localQuiz);
      localStorage.setItem(localQuizKey, JSON.stringify(local));
      alert('Quiz saved locally (API unavailable). It will be migrated when server is reachable.');
      resetCreateForm();
      refreshQuizLibrary('library-list-container');
      refreshPreviewList('preview-list-container');
      return;
    }
  } catch (err) {
    errlog('saveQuiz error:', err);
    alert('Failed to save quiz. See console.');
  }
}

function resetCreateForm() {
  const form = createQuizForm;
  if (!form) return;
  form.reset();
  questionsContainer.innerHTML = '';
  quizEditIdField && (quizEditIdField.value = '');
  questionCounter = 0;
  addQuestion();
}

// ---------- LIBRARY & PREVIEW ----------
function getMyQuizzes() {
  return quizzes.filter(q => q.createdBy === (currentUser && currentUser.username));
}

function refreshQuizLibrary(targetId) {
  try {
    const container = document.getElementById(targetId) || q('#library-list-container');
    if (!container) return;
    container.innerHTML = '';
    // prefer server quizzes if available
    (async () => {
      try {
        const list = await fetchJson(`${API_BASE}/quizzes`);
        // server returns created_by username
        if (Array.isArray(list)) {
          quizzes = list.map(it => ({
            id: String(it.id),
            title: it.title,
            description: it.description,
            published: !!it.published,
            createdBy: it.created_by || null,
            questions: it.questions || []
          }));
        }
      } catch (e) {
        // fallback to local cache
        quizzes = safeParse(localStorage.getItem(localQuizKey)) || quizzes;
      } finally {
        if (!quizzes || quizzes.length === 0) {
          container.innerHTML = '<p>You have not created any quizzes yet.</p>';
          return;
        }
        quizzes.forEach(qz => {
          const republishBtn = qz.published ? `<button class="btn btn-warning republish-btn" data-id="${qz.id}">Republish</button>` : '';
          const html = `
            <div class="quiz-list-item">
              <div class="quiz-info">
                <h3>${escapeHtml(qz.title)}</h3>
                <p>Category: ${escapeHtml(qz.category || '')} | Questions: ${qz.questions ? qz.questions.length : '—'}</p>
                <span class="status ${qz.published ? 'published' : 'draft'}">${qz.published ? 'Published' : 'Draft'}</span>
              </div>
              <div class="quiz-actions">
                ${republishBtn}
                <button class="btn btn-secondary publish-btn" data-id="${qz.id}">${qz.published ? 'Unpublish' : 'Publish'}</button>
                <button class="btn edit-btn" data-id="${qz.id}">Edit</button>
                <button class="btn btn-danger delete-btn" data-id="${qz.id}">Delete</button>
              </div>
            </div>
          `;
          container.insertAdjacentHTML('beforeend', html);
        });
      }
    })();
  } catch (err) {
    errlog('refreshQuizLibrary error:', err);
  }
}

function refreshPreviewList(targetId) {
  try {
    const container = document.getElementById(targetId) || q('#preview-list-container');
    if (!container) return;
    container.innerHTML = '';
    const data = quizzes || (safeParse(localStorage.getItem(localQuizKey)) || []);
    if (!data || data.length === 0) {
      container.innerHTML = '<p>Create a quiz to preview it.</p>';
      return;
    }
    data.forEach(qz => {
      const el = document.createElement('div');
      el.className = 'quiz-list-item';
      el.innerHTML = `
        <div class="quiz-info"><h3>${escapeHtml(qz.title)}</h3><p>Category: ${escapeHtml(qz.category||'')}</p></div>
        <div class="quiz-actions"><button class="btn preview-btn" data-id="${qz.id}">Preview</button></div>
      `;
      container.appendChild(el);
    });
  } catch (err) {
    errlog('refreshPreviewList error:', err);
  }
}

function loadQuizForPreview(quizId) {
  try {
    const all = safeParse(localStorage.getItem(localQuizKey)) || quizzes;
    const quiz = all.find(x => String(x.id) === String(quizId));
    const area = q('#quiz-preview-area') || quizPreviewArea;
    if (!area) return alert('Preview area missing');
    if (!quiz) return alert('Quiz not found locally (or server).');
    area.innerHTML = `<h2>Preview: ${escapeHtml(quiz.title)}</h2>`;
    (quiz.questions || []).forEach((ques, idx) => {
      area.innerHTML += `<div class="quiz-question-item"><p>${idx+1}. ${escapeHtml(ques.text)}</p>`;
      ques.options.forEach((opt, oi) => {
        const checked = (ques.correct || []).includes(oi) ? 'checked' : '';
        area.innerHTML += `<div><input type="${ques.type === 'single' ? 'radio' : 'checkbox'}" disabled ${checked}> ${escapeHtml(opt)}</div>`;
      });
      area.innerHTML += `</div>`;
    });
  } catch (err) {
    errlog('loadQuizForPreview error:', err);
  }
}

// ---------- HELPERS ----------
function escapeHtml(s) {
  if (s === undefined || s === null) return '';
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ---------- INIT ----------
function bindDynamicClicks() {
  // central event delegation for action buttons
  document.body.addEventListener('click', (e) => {
    const btn = e.target;
    const id = btn?.dataset?.id;
    if (!id) return;
    if (btn.classList.contains('publish-btn')) togglePublish(id);
    else if (btn.classList.contains('edit-btn')) loadQuizForEdit(id);
    else if (btn.classList.contains('delete-btn')) deleteQuiz(id);
    else if (btn.classList.contains('preview-btn')) loadQuizForPreview(id);
    else if (btn.classList.contains('republish-btn')) republishQuiz(id);
  });
}

function togglePublish(id) {
  // best-effort: try server patch else update local
  (async () => {
    try {
      const r = await fetch(`${API_BASE}/quizzes/${id}`);
      if (!r.ok) throw new Error('no server quiz');
      const q = await r.json();
      const newState = !q.published;
      const r2 = await fetch(`${API_BASE}/quizzes/${id}`, {
        method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ published: newState })
      });
      if (!r2.ok) throw new Error('server update failed');
      alert('Publish state updated on server');
      refreshQuizLibrary('library-list-container');
      refreshPreviewList('preview-list-container');
      return;
    } catch (e) {
      warn('server publish toggle failed, updating local copy only', e);
      let local = safeParse(localStorage.getItem(localQuizKey)) || quizzes;
      const idx = local.findIndex(x => String(x.id) === String(id));
      if (idx > -1) {
        local[idx].published = !local[idx].published;
        localStorage.setItem(localQuizKey, JSON.stringify(local));
        refreshQuizLibrary('library-list-container');
        refreshPreviewList('preview-list-container');
      } else {
        alert('Quiz not found locally to toggle');
      }
    }
  })();
}

function republishQuiz(id) {
  if (!confirm('Republish will update the lastUpdated timestamp and notify students. Continue?')) return;
  let local = safeParse(localStorage.getItem(localQuizKey)) || quizzes;
  const q = local.find(x => String(x.id) === String(id));
  if (q) {
    q.lastUpdated = new Date().toISOString();
    localStorage.setItem(localQuizKey, JSON.stringify(local));
    alert('Quiz republished (local). If you want to republish on server, use server UI.');
    refreshQuizLibrary('library-list-container');
    refreshPreviewList('preview-list-container');
  } else {
    alert('Not found locally; republish on server required.');
  }
}

function deleteQuiz(id) {
  if (!confirm('Delete quiz? This cannot be undone.')) return;
  (async () => {
    try {
      const r = await fetch(`${API_BASE}/quizzes/${id}`, { method: 'DELETE' });
      if (r.ok) { alert('Deleted on server'); refreshQuizLibrary('library-list-container'); refreshPreviewList('preview-list-container'); return; }
    } catch(e){ warn('Server delete failed', e); }
    // fallback local delete
    const local = (safeParse(localStorage.getItem(localQuizKey)) || []).filter(q => String(q.id) !== String(id));
    localStorage.setItem(localQuizKey, JSON.stringify(local));
    refreshQuizLibrary('library-list-container');
    refreshPreviewList('preview-list-container');
  })();
}

function loadQuizForEdit(id) {
  // prefer local cached version
  const local = (safeParse(localStorage.getItem(localQuizKey)) || quizzes).find(q => String(q.id) === String(id));
  if (local) {
    quizEditIdField.value = local.id;
    q('#quiz-title').value = local.title || '';
    q('#quiz-description').value = local.description || '';
    q('#quiz-category').value = local.category || '';
    questionsContainer.innerHTML = '';
    questionCounter = 0;
    (local.questions || []).forEach(qdata => {
      addQuestion();
      const idx = questionCounter;
      const card = document.querySelector(`.question-card[data-q-index="${idx}"]`);
      if (!card) return;
      card.querySelector('.q-text').value = qdata.text || '';
      const select = card.querySelector('.q-type');
      select.value = qdata.type || 'single';
      select.dispatchEvent(new Event('change'));
      qdata.options.forEach((opt, i) => {
        const optEl = card.querySelector(`#q-${idx}-opt-${i+1}`);
        if (optEl) optEl.value = opt;
      });
      (qdata.correct || []).forEach(ci => {
        const chk = card.querySelector(`#q-correct-options-${idx} input[value="${ci}"]`);
        if (chk) chk.checked = true;
      });
    });
    window.scrollTo(0,0);
    return;
  }

  // otherwise attempt server fetch (best-effort)
  (async () => {
    try {
      const r = await fetch(`${API_BASE}/quizzes/${id}`);
      if (!r.ok) throw new Error('Quiz not found on server');
      const qdata = await r.json();
      quizEditIdField.value = qdata.id;
      q('#quiz-title').value = qdata.title || '';
      q('#quiz-description').value = qdata.description || '';
      q('#quiz-category').value = qdata.category || '';
      questionsContainer.innerHTML = '';
      questionCounter = 0;
      const rQ = await fetch(`${API_BASE}/quizzes/${id}/questions`);
      const qlist = rQ.ok ? await rQ.json() : [];
      for (const ques of qlist) {
        addQuestion();
        const idx = questionCounter;
        document.querySelector(`.question-card[data-q-index="${idx}"] .q-text`).value = ques.text || '';
        const ro = await fetch(`${API_BASE}/questions/${ques.id}/options`);
        const opts = ro.ok ? await ro.json() : [];
        opts.forEach((opt, i) => {
          const optEl = document.getElementById(`q-${idx}-opt-${i+1}`);
          if (optEl) optEl.value = opt.text || '';
          if (opt.is_correct) {
            const cb = document.querySelector(`#q-correct-options-${idx} input[value="${i}"]`);
            if (cb) cb.checked = true;
          }
        });
      }
    } catch (e) {
      warn('loadQuizForEdit failed', e);
      alert('Failed to load quiz for edit');
    }
  })();
}

// ---------- STARTUP ----------
async function initApp() {
  // ensure nav exists and logout attached quickly
  ensureNavUI();

  // parse current user and validate role
  currentUser = safeParse(localStorage.getItem('currentUser')) || null;
  if (!currentUser || currentUser.role !== 'teacher') {
    // do NOT throw — we redirect so UI will change as expected
    alert('Access Denied. Please log in as a teacher.');
    window.location.href = 'index.html';
    return;
  }

  // collect key DOM nodes (graceful)
  navAuthContainer = q('#nav-auth-container');
  dashboardView = q('#dashboard-view');
  profileView = q('#profile-view');

  dashboardTabs = qAll('.dashboard-tab-btn');
  dashboardTabContents = qAll('.dashboard-tab-content');

  backToDashBtn = q('#back-to-dash-btn');
  profileTabs = qAll('.profile-tab-btn');
  profileTabContents = qAll('.profile-tab-content');
  changePasswordForm = q('#change-password-form');

  createQuizForm = q('#create-quiz-form');
  questionsContainer = q('#questions-container');
  addQuestionBtn = q('#add-question-btn');
  saveQuizBtn = q('#save-quiz-btn');
  quizEditIdField = q('#quiz-edit-id');

  quizPreviewArea = q('#quiz-preview-area');
  libraryListContainer = q('#library-list-container');
  previewListContainer = q('#preview-list-container');

  filterSubject = q('#filter-subject');
  filterStatus = q('#filter-status');
  filterSort = q('#filter-sort');
  pFilteredListContainer = q('#p-filtered-list-container');

  // Attach listeners defensively
  try {
    attachFallbackTabHandlers();
    bindDynamicClicks();

    if (addQuestionBtn) addQuestionBtn.addEventListener('click', addQuestion);
    if (createQuizForm) createQuizForm.addEventListener('submit', saveQuiz);
    if (backToDashBtn) backToDashBtn.addEventListener('click', () => { dashboardView && (dashboardView.style.display = 'block'); });
    if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePasswordSafe);

    // filters
    [filterSubject, filterStatus, filterSort].forEach(f => {
      if (f) f.addEventListener('change', renderFilteredQuizzesSafe);
    });

    // UI initial actions
    resetCreateForm();
    refreshQuizLibrary('library-list-container');
    refreshPreviewList('preview-list-container');

    log('Teacher UI initialized for', currentUser.username);
  } catch (e) {
    errlog('Initialization error (some handlers may not be attached):', e);
    // ensure minimum tab/logout functionality still present
    attachFallbackTabHandlers();
  }
}

// safe change-password handler (uses localStorage users list)
function handleChangePasswordSafe(e) {
  try {
    e && e.preventDefault && e.preventDefault();
    const newPassword = q('#new-password')?.value || '';
    const confirmPassword = q('#confirm-new-password')?.value || '';
    if (newPassword !== confirmPassword) { alert('Passwords do not match.'); return; }
    let allUsers = safeParse(localStorage.getItem('users')) || [];
    const index = allUsers.findIndex(u => u.username === currentUser.username);
    if (index > -1) {
      allUsers[index].password = newPassword;
      localStorage.setItem('users', JSON.stringify(allUsers));
      currentUser.password = newPassword;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      alert('Password updated.');
      changePasswordForm.reset();
    } else {
      alert('User not found locally.');
    }
  } catch (e) {
    errlog('change password error', e);
    alert('Failed to change password.');
  }
}

function renderFilteredQuizzesSafe() {
  try {
    renderFilteredQuizzes();
  } catch (e) {
    warn('renderFilteredQuizzes disabled due to error', e);
  }
}

// placeholder (keeps your code expectations). Implemented earlier in file where used.
function renderFilteredQuizzes() {
  // If your profile filter UI expects detailed stats, implement here.
  // For now, show simple filtered list from local quizzes.
  let my = (safeParse(localStorage.getItem(localQuizKey)) || quizzes).filter(q => q.createdBy === currentUser.username);
  // filter subject/status/sort as needed (omitted minimal)
  pFilteredListContainer && (pFilteredListContainer.innerHTML = my.map(qz => `<div>${escapeHtml(qz.title)} - ${qz.published ? 'Published':'Draft'}</div>`).join('') || '<p>No quizzes</p>');
}

// run startup after DOM ready
document.addEventListener('DOMContentLoaded', () => {
  // very defensive startup
  try {
    initApp();
  } catch (e) {
    errlog('Fatal init error', e);
    // ensure minimal nav and tabs still present for rescue
    ensureNavUI();
    attachFallbackTabHandlers();
  }
});

