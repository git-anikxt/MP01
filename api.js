// api.js — non-module version (attach helpers to window)

(function () {
  const API_BASE = 'http://localhost:5000/api';

  async function fetchQuizzes() {
    const res = await fetch(`${API_BASE}/quizzes`);
    if (!res.ok) throw new Error('Failed to fetch quizzes');
    return res.json();
  }

  async function createQuiz(payload) {
    const res = await fetch(`${API_BASE}/quizzes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create quiz');
    return res.json();
  }

  async function createQuestion(payload) {
    const res = await fetch(`${API_BASE}/questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create question');
    return res.json();
  }

  async function createOption(payload) {
    const res = await fetch(`${API_BASE}/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Failed to create option');
    return res.json();
  }

  async function registerUser(payload) {
    return fetch(`${API_BASE}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  async function loginUser(payload) {
    return fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  async function submitResult(payload) {
    return fetch(`${API_BASE}/results`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  }

  // expose functions on window so your existing scripts can call them
  window.api = {
    fetchQuizzes,
    createQuiz,
    createQuestion,
    createOption,
    registerUser,
    loginUser,
    submitResult
  };
})();

