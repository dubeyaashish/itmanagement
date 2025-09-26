const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { pool } = require('../db');
const { JWT_SECRET } = require('../middleware/auth');

function signToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '8h' });
}

// Using centralized auth table (auth_users); no default admin creation here.
async function ensureDefaultAdmin() { return; }

function normalizePhpBcrypt(hash) {
  // PHP password_hash uses $2y$ for bcrypt; bcryptjs supports $2a/$2b.
  if (typeof hash === 'string' && hash.startsWith('$2y$')) return '$2a$' + hash.slice(4);
  return hash;
}

async function loginHandler(req, res) {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });
  const conn = await pool.getConnection();
  try {
    // Treat provided username as email for centralized auth
    const [rows] = await conn.query('SELECT id, email, password_hash, role FROM auth_users WHERE email=?', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, normalizePhpBcrypt(user.password_hash));
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });
    const rawRole = (user.role || '').toString().toLowerCase();
    const roleNorm = rawRole === 'admin' ? 'admin' : (rawRole === 'hr' ? 'hr' : 'user');
    const token = signToken({ id: user.id, username: user.email, role: roleNorm });
    res.json({ token, user: { id: user.id, username: user.email, full_name: null, role: roleNorm } });
  } finally {
    conn.release();
  }
}

module.exports = { ensureDefaultAdmin, loginHandler };
