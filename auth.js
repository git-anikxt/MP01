// auth.js - tolerant register/login handlers (tries multiple selectors), with debug logging
const API_BASE = (typeof apiBase !== 'undefined' && apiBase) ? apiBase : 'http://localhost:5000/api';

document.addEventListener('DOMContentLoaded', () => {
  // small helpers
  const debug = (...a) => console.log('[auth]', ...a);
  function notify(msg, type = 'info') {
    try { alert(msg); return; } catch (e) { /* alert blocked */ }
    const banner = document.createElement('div');
    banner.style.position = 'fixed';
    banner.style.top = '12px';
    banner.style.left = '50%';
    banner.style.transform = 'translateX(-50%)';
    banner.style.zIndex = 99999;
    banner.style.padding = '10px 14px';
    banner.style.borderRadius = '6px';
    banner.style.boxShadow = '0 2px 8px rgba(0,0,0,.25)';
    banner.style.background = (type === 'error') ? '#ffdddd' : '#eef6ff';
    banner.textContent = msg;
    document.body.appendChild(banner);
    setTimeout(() => banner.remove(), 6000);
  }
  function $qsMany(selectors) {
    // selectors: array of css selectors to try in order, returns first non-null element
    for (const s of selectors) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }
  function getValueFromVariants(variants) {
    // variants: array of selectors or element-factory fns; returns {value, selector}
    for (const sel of variants) {
      const el = (typeof sel === 'string') ? document.querySelector(sel) : sel();
      if (el && ('value' in el)) {
        return { value: String(el.value || '').trim(), selector: (typeof sel === 'string') ? sel : '(fn)' };
      }
    }
    return { value: '', selector: null };
  }

  // --- LOGIN (same tolerant approach) ---
  const loginForm = document.getElementById('login-form') || document.querySelector('form#login') || document.querySelector('form[data-role="login"]');
  if (loginForm) {
    loginForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const usernameInfo = getValueFromVariants(['#username', '#login-username', '#user', 'input[name="username"]']);
      const passwordInfo = getValueFromVariants(['#password', '#login-password', 'input[name="password"]']);
      const roleInfo = getValueFromVariants(['#role', 'select#role', 'select[name="role"]']);

      debug('[login] username selector:', usernameInfo.selector, 'password selector:', passwordInfo.selector, 'role selector:', roleInfo.selector);
      const username = usernameInfo.value;
      const password = passwordInfo.value;
      const role = roleInfo.value || '';

      if (!username || !password) { notify('Please enter username and password.', 'error'); return; }

      try {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({ username, password })
        });
        debug('[login] status', res.status);
        const json = await res.json().catch(() => ({}));
        debug('[login] body', json);
        if (!res.ok) {
          if (res.status === 401) notify('Invalid username or password (server).', 'error');
          else notify(`Login failed: ${json.error || res.statusText}`, 'error');
          return;
        }
        // success
        const user = json;
        localStorage.setItem('currentUser', JSON.stringify(user));
        notify('Login successful');
        if (user.role === 'admin') window.location.href = 'admin.html';
        else if (user.role === 'teacher') window.location.href = 'teacher.html';
        else window.location.href = 'student.html';
      } catch (err) {
        console.error('[login] error', err);
        notify('Login error — check console', 'error');
      }
    });
  } else debug('No login form found');

  // --- REGISTER (tolerant selectors) ---
  const registerForm = document.getElementById('register-form') || document.querySelector('form#register') || document.querySelector('form[data-role="register"]');
  if (registerForm) {
    registerForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();

      // Try multiple id/name variants commonly used in different HTML files
      const u = getValueFromVariants(['#reg-username', '#reg_user', '#username', '#user', 'input[name="username"]']);
      const p = getValueFromVariants(['#reg-password', '#reg_password', '#password', 'input[name="password"]']);
      const c = getValueFromVariants(['#reg-password-confirm', '#reg_password_confirm', '#confirm-password', '#confirm', 'input[name="confirm"]']);
      const r = getValueFromVariants(['#reg-role', 'select#reg-role', '#role', 'select[name="role"]']);

      debug('[register] resolved selectors ->', { usernameSel: u.selector, passSel: p.selector, confirmSel: c.selector, roleSel: r.selector });
      debug('[register] resolved values lengths ->', { usernameLen: u.value.length, passLen: p.value.length, confirmLen: c.value.length, role: r.value });

      const username = u.value;
      const password = p.value;
      const confirm = c.value;
      const role = r.value || 'student';

      // validation
      if (!username || !password || !confirm) {
        notify('Please fill all required fields.', 'error');
        return;
      }
      if (password !== confirm) {
        notify('Passwords do not match.', 'error');
        return;
      }

      try {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ username, password, role })
        });
        debug('[register] status', res.status);
        const json = await res.json().catch(() => ({}));
        debug('[register] body', json);

        if (!res.ok) {
          if (res.status === 409) notify('Username already exists.', 'error');
          else notify(`Register failed: ${json.error || res.statusText}`, 'error');
          return;
        }

        // success - save user and redirect by role
        notify('Registration successful — logged in.');
        localStorage.setItem('currentUser', JSON.stringify(json));
        if (json.role === 'admin') window.location.href = 'admin.html';
        else if (json.role === 'teacher') window.location.href = 'teacher.html';
        else window.location.href = 'student.html';
      } catch (err) {
        console.error('[register] error', err);
        notify('Registration error — see console', 'error');
      }
    });
  } else debug('No register form found');

  // --- Logout wiring if present ---
  const logoutBtn = document.getElementById('logout-btn') || document.querySelector('.logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.removeItem('currentUser');
      notify('Logged out');
      window.location.href = 'index.html';
    });
  }
});

