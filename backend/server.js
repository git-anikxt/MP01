// backend/server.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const pool = require('./db');

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

function log(...a){ console.log('[srv]', ...a); }

/**
 * Ensure minimal schema exists (dev-only friendly)
 * quizzes.created_by is an INT FK -> users.id
 * If your DB already has a different quizzes.created_by type, consider
 * adjusting/migrating that table separately. This code will create tables
 * only if they don't exist.
 */
async function ensureSchema() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) UNIQUE,
        password VARCHAR(255),
        role VARCHAR(40) DEFAULT 'student',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    // quizzes.created_by is INT referencing users.id
    await pool.query(`
      CREATE TABLE IF NOT EXISTS quizzes (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        created_by INT NULL,
        published TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS questions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id INT NOT NULL,
        text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (quiz_id) REFERENCES quizzes(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS options (
        id INT AUTO_INCREMENT PRIMARY KEY,
        question_id INT NOT NULL,
        text TEXT,
        is_correct TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS results (
        id INT AUTO_INCREMENT PRIMARY KEY,
        quiz_id INT,
        user_id INT,
        score INT,
        taken_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);

    log('DB schema ensured (tables exist or were created).');
  } catch (err) {
    console.error('Error ensuring schema:', err);
    throw err;
  }
}

/* ---------------------------
   Helper functions
   --------------------------- */

// Accept either username (string) or id (number/string of digits).
// If username provided and not found -> create the user (auto-create).
// Returns user id (int) or null.
async function resolveOrCreateUserId(created_by) {
  if (created_by === undefined || created_by === null) return null;

  // numeric id
  if (typeof created_by === 'number' || /^\d+$/.test(String(created_by))) {
    const id = parseInt(created_by, 10);
    // verify user exists
    const [rows] = await pool.query('SELECT id FROM users WHERE id = ?', [id]);
    return rows.length ? id : null;
  }

  // treat as username string
  const username = String(created_by).trim();
  if (!username) return null;

  // find existing user
  const [rows] = await pool.query('SELECT id FROM users WHERE username = ?', [username]);
  if (rows.length) return rows[0].id;

  // not found -> create a user with no password (auto-created)
  // create user with safe non-null password (empty string) to satisfy any NOT NULL constraint
const safePassword = '';
const [result] = await pool.query(
  'INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
  [username, safePassword, 'teacher']
);

  log('Auto-created user for migration:', username, '-> id', result.insertId);
  return result.insertId;
}

// Return created_by as username (or null) for a quiz id
async function getUsernameForUserId(userId) {
  if (!userId) return null;
  const [rows] = await pool.query('SELECT username FROM users WHERE id = ?', [userId]);
  return rows.length ? rows[0].username : null;
}

/* ---------------------------
   Routes
   --------------------------- */

// health
app.get('/api/health', (req, res) => res.json({ ok: true }));

// GET quizzes (return created_by as username via LEFT JOIN)
app.get('/api/quizzes', async (req, res) => {
  try {
    const sql = `
      SELECT q.id, q.title, q.description, q.published, q.created_at,
             u.username AS created_by
      FROM quizzes q
      LEFT JOIN users u ON q.created_by = u.id
      ORDER BY q.created_at DESC
    `;
    const [rows] = await pool.query(sql);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/quizzes error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// GET single quiz (with created_by username)
app.get('/api/quizzes/:id', async (req, res) => {
  try {
    const sql = `
      SELECT q.id, q.title, q.description, q.published, q.created_at,
             u.username AS created_by
      FROM quizzes q
      LEFT JOIN users u ON q.created_by = u.id
      WHERE q.id = ?
    `;
    const [rows] = await pool.query(sql, [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error('GET /api/quizzes/:id error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// POST create quiz
// Accepts { title, description, created_by } where created_by may be username or id.
// If created_by is username not found, this code will auto-create that user (for migration).
app.post('/api/quizzes', async (req, res) => {
  try {
    const { title, description, created_by } = req.body;
    if (!title) return res.status(400).json({ error: 'title required' });

    // resolve (or create) user id to store in quizzes.created_by
    const userId = await resolveOrCreateUserId(created_by);

    const [result] = await pool.query(
      'INSERT INTO quizzes (title, description, created_by) VALUES (?, ?, ?)',
      [title, description || null, userId]
    );
    const insertedId = result.insertId;

    // return created row with username for created_by
    const [rows] = await pool.query(`
      SELECT q.id, q.title, q.description, q.published, q.created_at, u.username AS created_by
      FROM quizzes q LEFT JOIN users u ON q.created_by = u.id WHERE q.id = ?
    `, [insertedId]);

    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/quizzes error:', err);
    // if a foreign key or other DB error occurs, surface message for debugging
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// PATCH quiz (partial updates)
app.patch('/api/quizzes/:id', async (req, res) => {
  try {
    const { title, description, published, created_by } = req.body;
    const updates = [];
    const params = [];

    if (title !== undefined) { updates.push('title = ?'); params.push(title); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (published !== undefined) { updates.push('published = ?'); params.push(published ? 1 : 0); }
    if (created_by !== undefined) {
      const userId = await resolveOrCreateUserId(created_by);
      updates.push('created_by = ?'); params.push(userId);
    }

    if (!updates.length) return res.status(400).json({ error: 'no fields to update' });

    params.push(req.params.id);
    await pool.query(`UPDATE quizzes SET ${updates.join(', ')} WHERE id = ?`, params);

    const [rows] = await pool.query(`
      SELECT q.id, q.title, q.description, q.published, q.created_at, u.username AS created_by
      FROM quizzes q LEFT JOIN users u ON q.created_by = u.id WHERE q.id = ?
    `, [req.params.id]);

    res.json(rows[0] || null);
  } catch (err) {
    console.error('PATCH /api/quizzes/:id error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// DELETE quiz
app.delete('/api/quizzes/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM quizzes WHERE id = ?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/quizzes/:id error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// QUESTIONS
app.post('/api/questions', async (req, res) => {
  try {
    const { quiz_id, text } = req.body;
    if (!quiz_id) return res.status(400).json({ error: 'quiz_id required' });
    const [result] = await pool.query('INSERT INTO questions (quiz_id, text) VALUES (?, ?)', [quiz_id, text || null]);
    const [rows] = await pool.query('SELECT id, quiz_id, text, created_at FROM questions WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/questions error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

app.get('/api/quizzes/:id/questions', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, quiz_id, text, created_at FROM questions WHERE quiz_id = ?', [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/quizzes/:id/questions error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// OPTIONS
app.post('/api/options', async (req, res) => {
  try {
    const { question_id, text, is_correct } = req.body;
    if (!question_id) return res.status(400).json({ error: 'question_id required' });
    const [result] = await pool.query('INSERT INTO options (question_id, text, is_correct) VALUES (?, ?, ?)', [question_id, text || null, is_correct ? 1 : 0]);
    const [rows] = await pool.query('SELECT id, question_id, text, is_correct, created_at FROM options WHERE id = ?', [result.insertId]);
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error('POST /api/options error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

app.get('/api/questions/:id/options', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, question_id, text, is_correct, created_at FROM options WHERE question_id = ?', [req.params.id]);
    res.json(rows);
  } catch (err) {
    console.error('GET /api/questions/:id/options error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

// AUTH (minimal)
app.post('/api/auth/register', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'username and password required' });
    const [result] = await pool.query('INSERT INTO users (username, password, role) VALUES (?, ?, ?)', [username, password, role || 'student']);
    res.status(201).json({ id: result.insertId, username, role: role || 'student' });
  } catch (err) {
    console.error('POST /api/auth/register error:', err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'username exists' });
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const [rows] = await pool.query('SELECT id, username, role FROM users WHERE username = ? AND password = ?', [username, password]);
    if (!rows.length) return res.status(401).json({ error: 'invalid credentials' });
    res.json(rows[0]);
  } catch (err) {
    console.error('POST /api/auth/login error:', err);
    res.status(500).json({ error: 'server error', detail: err.message });
  }
});

/* ---------------------------
   Start up
   --------------------------- */
const PORT = process.env.PORT || 5000;
(async () => {
  try {
    // test DB connection
    const [r] = await pool.query('SELECT 1 AS ok');
    log('DB test OK:', r[0]);

    await ensureSchema();

    app.listen(PORT, () => {
      log(`Backend listening on ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error - cannot start server:', err);
    process.exit(1);
  }
})();





