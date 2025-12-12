// student.js
// Student dashboard: API-first with localStorage fallback
// Works with the student.html structure you provided.

document.addEventListener('DOMContentLoaded', () => {
  const API_BASE = 'http://localhost:5000/api';

  // --- Auth check ---
  const currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
  if (!currentUser || currentUser.role !== 'student') {
    alert('Please log in as a student.');
    window.location.href = 'index.html';
    return;
  }

  // --- DOM refs (match your HTML) ---
  const navAuthContainer = document.getElementById('nav-auth-container');

  const dashboardTabsBtns = document.querySelectorAll('.dashboard-tab-btn');
  const dashboardTabContents = document.querySelectorAll('.dashboard-tab-content');

  const availableListContainer = document.getElementById('available-list-container');
  const attemptsListContainer = document.getElementById('attempts-list-container');

  const quizViewContainer = document.getElementById('quiz-view-container');
  const quizViewTitle = document.getElementById('quiz-view-title');
  const quizViewDescription = document.getElementById('quiz-view-description');
  const quizAttemptForm = document.getElementById('quiz-attempt-form');
  const quizQuestionsArea = document.getElementById('quiz-questions-area');

  const profileView = document.getElementById('profile-view');
  const backToDashBtn = document.getElementById('back-to-dash-btn');
  const profileTabBtns = document.querySelectorAll('.profile-tab-btn');
  const profileTabContents = document.querySelectorAll('.profile-tab-content');
  const changePasswordForm = document.getElementById('change-password-form');

  // Filter UI ids (profile filter tab)
  const filterSubject = document.getElementById('filter-subject-stud');
  const filterStatus = document.getElementById('filter-status-stud');
  const filterSort = document.getElementById('filter-sort-stud');
  const pFilteredListContainer = document.getElementById('p-filtered-list-container-stud');

  // --- Utility ---
  function escapeHtml(s) {
    if (s === undefined || s === null) return '';
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function apiAvailable() {
    try {
      const r = await fetch(`${API_BASE}/health`, { cache: 'no-store' });
      return r.ok;
    } catch (e) {
      return false;
    }
  }

  // Try to fetch quizzes from API; fallback to local storage
  async function getQuizzes() {
    if (await apiAvailable()) {
      try {
        const r = await fetch(`${API_BASE}/quizzes`);
        if (r.ok) {
          const list = await r.json();
          localStorage.setItem('quizzes_cache', JSON.stringify(list));
          return list;
        }
      } catch (e) {
        console.warn('Failed to fetch quizzes from API, falling back to cache/local', e);
      }
    }
    // fallback: quizzes_cache or quizzes (old key)
    const cache = localStorage.getItem('quizzes_cache');
    if (cache) return JSON.parse(cache);
    const local = localStorage.getItem('quizzes');
    return local ? JSON.parse(local) : [];
  }

  // Fetch questions + options for a quiz (API first; fallback to local structure)
  async function getQuizDetail(quizId) {
    if (await apiAvailable()) {
      try {
        const rq = await fetch(`${API_BASE}/quizzes/${quizId}/questions`);
        const questions = rq.ok ? await rq.json() : [];
        for (const q of questions) {
          const ro = await fetch(`${API_BASE}/questions/${q.id}/options`);
          q.options = ro.ok ? await ro.json() : [];
        }
        return { questions };
      } catch (e) {
        console.warn('API quiz detail failed', e);
      }
    }

    // fallback: try to use cached local quizzes structure
    const localQuizzes = JSON.parse(localStorage.getItem('quizzes') || '[]');
    const quiz = localQuizzes.find(x => String(x.id) === String(quizId));
    if (!quiz) return { questions: [] };
    // if quiz.questions stored with text/options -> use that
    return { questions: quiz.questions || [] };
  }

  // --- Navbar / Logout ---
  function setupNavbar() {
    if (!navAuthContainer) return;
    navAuthContainer.innerHTML = `
      <a href="#" id="student-profile-link">${escapeHtml(currentUser.username)}</a>
      <button id="student-logout-btn" class="btn btn-secondary" style="width:auto;padding:6px 10px;margin-left:12px;">Logout</button>
    `;
    document.getElementById('student-logout-btn').addEventListener('click', () => {
      localStorage.removeItem('currentUser');
      window.location.href = 'index.html';
    });
    document.getElementById('student-profile-link').addEventListener('click', (e) => {
      e.preventDefault();
      // open profile view
      showProfile();
    });
  }

  // --- Tab switching (dashboard) ---
  function switchDashboardTab(tabId) {
    dashboardTabContents.forEach(c => {
      if (c.id === tabId) {
        c.classList.add('active');
        c.style.display = ''; // default
      } else {
        c.classList.remove('active');
        c.style.display = 'none';
      }
    });
    dashboardTabsBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tabId);
    });

    // hide quiz view when switching to dashboard tabs
    if (quizViewContainer) quizViewContainer.style.display = 'none';
  }

  dashboardTabsBtns.forEach(btn => {
    btn.addEventListener('click', () => switchDashboardTab(btn.dataset.tab));
  });

  // --- Profile tab switching ---
  function switchProfileTab(tabId) {
    profileTabContents.forEach(c => {
      if (c.id === tabId) {
        c.classList.add('active');
        c.style.display = '';
      } else {
        c.classList.remove('active');
        c.style.display = 'none';
      }
    });
    profileTabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  }

  profileTabBtns.forEach(btn => {
    btn.addEventListener('click', () => switchProfileTab(btn.dataset.tab));
  });

  // --- Show / hide profile view ---
  function showProfile() {
    document.getElementById('dashboard-view').style.display = 'none';
    profileView.style.display = 'block';
  }
  if (backToDashBtn) backToDashBtn.addEventListener('click', () => {
    profileView.style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
  });

  // --- Render Available Quizzes ---
  async function renderAvailableQuizzes() {
    const list = await getQuizzes();
    availableListContainer.innerHTML = '';

    if (!list.length) {
      availableListContainer.innerHTML = '<p>No quizzes found.</p>';
      return;
    }

    list.forEach(q => {
      const card = document.createElement('div');
      card.className = 'quiz-card';
      card.style = 'background:#fff;border-radius:8px;padding:14px;margin:8px 0;box-shadow:0 1px 6px rgba(0,0,0,0.06);';

      const title = escapeHtml(q.title || 'Untitled');
      const desc = escapeHtml(q.description || '');
      const id = q.id;

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h4 style="margin:0 0 6px 0">${title}</h4>
            <p style="margin:0;color:#666">${desc}</p>
          </div>
          <div>
            <button class="btn btn-primary take-quiz-btn" data-id="${id}" style="padding:8px 12px">Take</button>
          </div>
        </div>
      `;
      availableListContainer.appendChild(card);
    });

    // attach handlers
    availableListContainer.querySelectorAll('.take-quiz-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const qid = e.currentTarget.dataset.id;
        await openQuiz(qid);
      });
    });
  }

  // --- Render Attempts list ---
  function renderAttemptsList() {
    attemptsListContainer.innerHTML = '';
    const attempts = JSON.parse(localStorage.getItem('studentAttempts') || '[]')
      .filter(a => a.username === currentUser.username)
      .sort((a,b) => new Date(b.takenAt) - new Date(a.takenAt));

    if (!attempts.length) {
      attemptsListContainer.innerHTML = '<p>No attempts yet.</p>';
      return;
    }

    attempts.forEach(a => {
      const div = document.createElement('div');
      div.className = 'attempt-card';
      div.style = 'background:#fff;padding:12px;border-radius:6px;margin:8px 0;border:1px solid #eee;';
      div.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center">
          <div>
            <h4 style="margin:0">${escapeHtml(a.quizTitle)}</h4>
            <p style="margin:0;color:#666">Score: ${a.score} / ${a.total} — ${new Date(a.takenAt).toLocaleString()}</p>
          </div>
        </div>
      `;
      attemptsListContainer.appendChild(div);
    });
  }

  // --- Open quiz view, render questions ---
  async function openQuiz(quizId) {
    // show quiz view container
    if (quizViewContainer) quizViewContainer.style.display = 'block';
    if (document.getElementById('dashboard-view')) document.getElementById('dashboard-view').style.display = 'none';

    // load quiz (title + description stored at top-level), and questions+options via API or local fallback
    const quizzes = await getQuizzes();
    const quiz = quizzes.find(q => String(q.id) === String(quizId)) || { id: quizId, title: 'Quiz', description: '' };

    quizViewTitle.textContent = quiz.title || 'Quiz';
    quizViewDescription.textContent = quiz.description || '';

    // load questions
    const detail = await getQuizDetail(quizId);
    const questions = detail.questions || [];

    // render form
    quizQuestionsArea.innerHTML = '';
    if (!questions.length) {
      quizQuestionsArea.innerHTML = '<p>No questions for this quiz.</p>';
    } else {
      questions.forEach((q, qi) => {
        const qBlock = document.createElement('div');
        qBlock.style = 'margin:12px 0;padding:10px;border-radius:6px;border:1px solid #f0f0f0;';
        const qText = escapeHtml(q.text || q.question || '');
        // determine if multi
        const isMulti = (q.type === 'multi') || (!!q.is_multi && Number(q.is_multi) === 1);
        const inputType = isMulti ? 'checkbox' : 'radio';
        const name = `q_${qi}`;

        // options array may be objects {text,is_correct} or simple strings
        const opts = q.options || q.choices || q.answers || [];
        let optsHtml = '';
        for (let i=0;i<opts.length;i++){
          const opt = opts[i];
          const optText = escapeHtml(opt.text || opt.choice || opt || '');
          optsHtml += `
            <div style="margin:6px 0;">
              <label>
                <input type="${inputType}" name="${name}" value="${i}" />
                ${optText}
              </label>
            </div>
          `;
        }

        qBlock.innerHTML = `<p style="margin:0 0 8px"><strong>${(qi+1)}. ${qText}</strong></p>${optsHtml}`;
        quizQuestionsArea.appendChild(qBlock);
      });
    }

    // attach submit handler (remove previous)
    quizAttemptForm.onsubmit = (ev) => {
      ev.preventDefault();
      submitAttempt(quiz, questions);
    };

    // scroll into view
    quizViewContainer.scrollIntoView({ behavior: 'smooth' });
  }

  // --- Submit / grade attempt ---
  function submitAttempt(quiz, questions) {
    // grade
    let score = 0;
    for (let qi=0; qi<questions.length; qi++) {
      const q = questions[qi];
      const isMulti = (q.type === 'multi') || (!!q.is_multi && Number(q.is_multi) === 1);
      const name = `q_${qi}`;
      const checkedEls = Array.from(quizAttemptForm.querySelectorAll(`input[name="${name}"]:checked`));
      const selected = checkedEls.map(el => parseInt(el.value, 10));
      // determine correct indices
      const opts = q.options || [];
      const correctIndices = opts.map((o, idx) => (o && (o.is_correct || o.isCorrect || o.correct) ? idx : -1)).filter(i => i !== -1);
      // fallback when options don't carry is_correct, attempt to accept first option as correct (rare)
      // check equality: selected contains all correctIndices and length equal
      const ok = selected.length === correctIndices.length && selected.every(s => correctIndices.includes(s));
      if (ok) score++;
    }

    // save attempt
    const attempts = JSON.parse(localStorage.getItem('studentAttempts') || '[]');
    attempts.push({
      username: currentUser.username,
      quizId: quiz.id,
      quizTitle: quiz.title || '',
      score,
      total: questions.length,
      takenAt: new Date().toISOString()
    });
    localStorage.setItem('studentAttempts', JSON.stringify(attempts));

    alert(`You scored ${score} / ${questions.length}`);

    // return to dashboard (attempts tab)
    if (quizViewContainer) quizViewContainer.style.display = 'none';
    if (document.getElementById('dashboard-view')) document.getElementById('dashboard-view').style.display = 'block';
    // switch to "my attempts" tab
    switchDashboardTab('my-attempts');
    renderAttemptsList();
  }

  // --- Change password handler (local-only users) ---
  if (changePasswordForm) {
    changePasswordForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const np = document.getElementById('new-password').value;
      const cp = document.getElementById('confirm-new-password').value;
      if (!np || !cp) { alert('Please fill both fields'); return; }
      if (np !== cp) { alert('Passwords do not match'); return; }

      let users = JSON.parse(localStorage.getItem('users') || '[]');
      const idx = users.findIndex(u => u.username === currentUser.username);
      if (idx === -1) {
        alert('Local user not found — cannot change password here.');
        return;
      }
      users[idx].password = np;
      localStorage.setItem('users', JSON.stringify(users));
      // update currentUser too
      currentUser.password = np;
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      alert('Password changed locally.');
      changePasswordForm.reset();
    });
  }

  // --- Profile: load data & filtered list ---
  function loadProfileData() {
    document.getElementById('p-info-username').textContent = currentUser.username;
    renderAttemptsList();

    // filtered list: combine quizzes with attempts
    renderFilteredQuizzes();
  }

  function renderFilteredQuizzes() {
    const subject = filterSubject ? filterSubject.value : 'all';
    const status = filterStatus ? filterStatus.value : 'all';
    const sortBy = filterSort ? filterSort.value : 'title';

    getQuizzes().then(allQuizzes => {
      // annotate with attempted status
      const attempts = JSON.parse(localStorage.getItem('studentAttempts') || '[]')
        .filter(a => a.username === currentUser.username);
      const attemptedIds = new Set(attempts.map(a => String(a.quizId)));

      let qlist = allQuizzes.slice();
      if (subject !== 'all') qlist = qlist.filter(q => (q.category || '') === subject);
      if (status === 'attempted') qlist = qlist.filter(q => attemptedIds.has(String(q.id)));
      if (status === 'not_attempted') qlist = qlist.filter(q => !attemptedIds.has(String(q.id)));

      if (sortBy === 'title') qlist.sort((a,b) => (a.title||'').localeCompare(b.title||''));
      if (sortBy === 'category') qlist.sort((a,b) => (a.category||'').localeCompare(b.category||''));

      // render
      pFilteredListContainer.innerHTML = '';
      if (!qlist.length) { pFilteredListContainer.innerHTML = '<p>No quizzes match filters.</p>'; return; }
      qlist.forEach(q => {
        const el = document.createElement('div');
        el.className = 'quiz-card';
        el.style='background:#fff;padding:12px;border-radius:6px;margin:10px 0;border:1px solid #eee;';
        el.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center">
          <div><h4 style="margin:0">${escapeHtml(q.title)}</h4><p style="margin:0;color:#666">${escapeHtml(q.description||'')}</p></div>
          <div><button class="btn btn-primary" data-id="${q.id}">Take</button></div>
        </div>`;
        pFilteredListContainer.appendChild(el);
      });
      // attach handlers
      pFilteredListContainer.querySelectorAll('button').forEach(b => b.addEventListener('click', e => openQuiz(e.currentTarget.dataset.id)));
    });
  }

  // wire filter change listeners
  if (filterSubject) filterSubject.addEventListener('change', renderFilteredQuizzes);
  if (filterStatus) filterStatus.addEventListener('change', renderFilteredQuizzes);
  if (filterSort) filterSort.addEventListener('change', renderFilteredQuizzes);

  // --- Initialization ---
  async function init() {
    setupNavbar();
    // show dashboard default
    switchDashboardTab('available-quizzes');
    // load data
    await renderAvailableQuizzes();
    renderAttemptsList();
    loadProfileData();
  }

  init();
});
