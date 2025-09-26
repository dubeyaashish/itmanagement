const express = require('express');
const { pool, isValidSlug, tableNamesFor } = require('../db');
const { authRequired, adminRequired, hrOrAdminRequired } = require('../middleware/auth');

const router = express.Router();

async function collectUserItems(conn, employeeId) {
  const items = [];
  const [cats] = await conn.query('SELECT slug, name FROM asset_categories ORDER BY name');
  for (const c of cats) {
    const { item } = tableNamesFor(c.slug);
    const [rows] = await conn.query(`SELECT id, brand, serial_number, \`condition\`, start_date FROM ${item} WHERE employee_id = ?`, [employeeId]);
    for (const r of rows) {
      items.push({
        id: r.id,
        brand: r.brand,
        serial_number: r.serial_number,
        condition: r.condition,
        start_date: r.start_date,
        category_slug: c.slug,
        category_name: c.name,
      });
    }
  }
  return items;
}

// Quick search for users by id, name, email (admin)
router.get('/users/search', authRequired, adminRequired, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  if (!q) return res.json([]);
  const conn = await pool.getConnection();
  try {
    const w = `%${q}%`;
    const [rows] = await conn.query(
      `SELECT employee_id, name, email, departments, job_title
       FROM asset_users
       WHERE employee_id LIKE ? OR name LIKE ? OR email LIKE ?
       ORDER BY name LIMIT 10`,
      [w, w, w]
    );
    res.json(rows);
  } finally {
    conn.release();
  }
});

// List users (admin)
router.get('/users', authRequired, adminRequired, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const offset = (page - 1) * pageSize;
  const conn = await pool.getConnection();
  try {
    const where = [];
    const params = [];
    if (q) {
      where.push('(name LIKE ? OR email LIKE ? OR departments LIKE ? OR job_title LIKE ?)');
      const w = `%${q}%`;
      params.push(w, w, w, w);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [tc] = await conn.query(`SELECT COUNT(*) AS total FROM asset_users ${whereSql}`, params);
    const total = tc[0]?.total || 0;
    const [rows] = await conn.query(
      `SELECT id, employee_id, name, email, departments, job_title FROM asset_users ${whereSql} ORDER BY name LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ data: rows, total, page, pageSize });
  } finally {
    conn.release();
  }
});

// My profile
router.get('/users/me', authRequired, async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const q = (req.query.q || '').toString().trim();
  const conn = await pool.getConnection();
  try {
    const [u] = await conn.query(
      'SELECT id, employee_id, name, email, departments, job_title, has_microsoft_365, has_codium_ememo, has_erp_netsuite FROM asset_users WHERE email=? LIMIT 1',
      [req.user.username]
    );
    if (u.length === 0) return res.status(404).json({ error: 'User not found in asset_users' });
    const user = u[0];
    let allItems = await collectUserItems(conn, user.employee_id);
    if (q) {
      const w = q.toLowerCase();
      allItems = allItems.filter(it =>
        (it.category_name || '').toLowerCase().includes(w) ||
        (it.brand || '').toLowerCase().includes(w) ||
        (it.serial_number || '').toLowerCase().includes(w) ||
        (it.condition || '').toLowerCase().includes(w)
      );
    }
    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const data = allItems.slice(start, start + pageSize);
    res.json({ user, items: { data, total, page, pageSize } });
  } finally {
    conn.release();
  }
});

// User detail by employee_id (admin or self)
router.get('/users/:employeeId', authRequired, async (req, res) => {
  const { employeeId } = req.params;
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const q = (req.query.q || '').toString().trim();
  const conn = await pool.getConnection();
  try {
    const [u] = await conn.query(
      'SELECT id, employee_id, name, email, departments, job_title, has_microsoft_365, has_codium_ememo, has_erp_netsuite FROM asset_users WHERE employee_id=? LIMIT 1',
      [employeeId]
    );
    if (u.length === 0) return res.status(404).json({ error: 'User not found' });
    const user = u[0];
    // authorization: admin or the same person (via email match)
    if (req.user.role !== 'admin' && req.user.username !== user.email) {
      return res.status(403).json({ error: 'Not allowed' });
    }
    let allItems = await collectUserItems(conn, user.employee_id);
    if (q) {
      const w = q.toLowerCase();
      allItems = allItems.filter(it =>
        (it.category_name || '').toLowerCase().includes(w) ||
        (it.brand || '').toLowerCase().includes(w) ||
        (it.serial_number || '').toLowerCase().includes(w) ||
        (it.condition || '').toLowerCase().includes(w)
      );
    }
    const total = allItems.length;
    const start = (page - 1) * pageSize;
    const data = allItems.slice(start, start + pageSize);
    res.json({ user, items: { data, total, page, pageSize } });
  } finally {
    conn.release();
  }
});

// License types (global)
router.get('/licenses', authRequired, hrOrAdminRequired, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query('SELECT id, name FROM asset_license_type ORDER BY name');
    res.json(rows);
  } finally { conn.release(); }
});

router.post('/licenses', authRequired, hrOrAdminRequired, async (req, res) => {
  const name = (req.body?.name || '').toString().trim();
  if (!name) return res.status(400).json({ error: 'name required' });
  const conn = await pool.getConnection();
  try {
    await conn.query('INSERT INTO asset_license_type (name) VALUES (?)', [name]);
    res.status(201).json({ ok: true });
  } finally { conn.release(); }
});

router.delete('/licenses/:id', authRequired, adminRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM asset_license_type WHERE id=?', [id]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

// User licenses
router.get('/users/:employeeId/licenses', authRequired, async (req, res) => {
  const { employeeId } = req.params;
  const conn = await pool.getConnection();
  try {
    // Authorization: admin or self
    const [u] = await conn.query('SELECT email FROM asset_users WHERE employee_id=? LIMIT 1', [employeeId]);
    if (!u.length) return res.status(404).json({ error: 'User not found' });
    if (req.user.role !== 'admin' && req.user.username !== u[0].email) return res.status(403).json({ error: 'Not allowed' });
    const [rows] = await conn.query(
      `SELECT lt.id, lt.name FROM asset_user_license ul JOIN asset_license_type lt ON lt.id = ul.license_type_id WHERE ul.employee_id=? ORDER BY lt.name`,
      [employeeId]
    );
    res.json(rows);
  } finally { conn.release(); }
});

router.post('/users/:employeeId/licenses', authRequired, adminRequired, async (req, res) => {
  const { employeeId } = req.params;
  let { type_id, name } = req.body || {};
  const conn = await pool.getConnection();
  try {
    if (!type_id) {
      name = (name || '').toString().trim();
      if (!name) return res.status(400).json({ error: 'type_id or name required' });
      const [ex] = await conn.query('SELECT id FROM asset_license_type WHERE name=?', [name]);
      if (ex.length) type_id = ex[0].id; else {
        const [crt] = await conn.query('INSERT INTO asset_license_type (name) VALUES (?)', [name]);
        type_id = crt.insertId;
      }
    }
    await conn.query('INSERT IGNORE INTO asset_user_license (employee_id, license_type_id) VALUES (?,?)', [employeeId, type_id]);
    res.status(201).json({ ok: true });
  } finally { conn.release(); }
});

router.delete('/users/:employeeId/licenses/:typeId', authRequired, adminRequired, async (req, res) => {
  const { employeeId, typeId } = req.params;
  const conn = await pool.getConnection();
  try {
    await conn.query('DELETE FROM asset_user_license WHERE employee_id=? AND license_type_id=?', [employeeId, typeId]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

// Asset users quick search (HR/Admin)
router.get('/asset-users/search', authRequired, hrOrAdminRequired, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const conn = await pool.getConnection();
  try {
    if (!q) return res.json([]);
    const w = `%${q}%`;
    const [rows] = await conn.query(
      `SELECT employee_id, name, email, departments
       FROM asset_users
       WHERE employee_id LIKE ? OR name LIKE ? OR email LIKE ?
       ORDER BY name LIMIT 10`,
      [w, w, w]
    );
    res.json(rows);
  } finally { conn.release(); }
});

// Distinct departments list (tokenized) for dropdowns (HR/Admin)
router.get('/departments', authRequired, hrOrAdminRequired, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(
      `SELECT DISTINCT departments FROM asset_users WHERE departments IS NOT NULL AND TRIM(departments) <> ''`
    );
    const set = new Set();
    for (const r of rows) {
      const raw = (r.departments || '').toString();
      // Split on comma and semicolon, trim
      raw.split(/[;,]/).forEach(part => {
        const v = part.trim();
        if (v) set.add(v);
      });
    }
    const list = Array.from(set).sort((a,b)=>a.localeCompare(b));
    res.json(list);
  } finally { conn.release(); }
});

// Role management (auth_users)
router.get('/roles/users', authRequired, adminRequired, async (req, res) => {
  const q = (req.query.q || '').toString().trim();
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const offset = (page - 1) * pageSize;
  const conn = await pool.getConnection();
  try {
    const params = [];
    let whereSql = '';
    if (q) {
      whereSql = 'WHERE au.email LIKE ?';
      params.push(`%${q}%`);
    }
    const [tc] = await conn.query(`SELECT COUNT(*) AS total FROM auth_users au ${whereSql}`, params);
    const total = tc[0]?.total || 0;
    const [rows] = await conn.query(
      `SELECT au.id, au.email, au.role, u.name
       FROM auth_users au
       LEFT JOIN asset_users u ON u.email = au.email
       ${whereSql}
       ORDER BY au.email
       LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ data: rows, total, page, pageSize });
  } finally { conn.release(); }
});

router.put('/roles/users/:id', authRequired, adminRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const role = (req.body?.role || '').toString().toLowerCase();
  if (!['admin','user','hr'].includes(role)) return res.status(400).json({ error: 'role must be admin, hr or user' });
  const conn = await pool.getConnection();
  try {
    const [aff] = await conn.query('UPDATE auth_users SET role=? WHERE id=?', [role, id]);
    if (!aff.affectedRows) return res.status(404).json({ error: 'User not found' });
    res.json({ ok: true });
  } finally { conn.release(); }
});

// Create asset user (HR/Admin)
router.post('/asset-users', authRequired, hrOrAdminRequired, async (req, res) => {
  const { employee_id, name, email, departments, phone_number, job_title, table_number } = req.body || {};
  if (!employee_id || !name) return res.status(400).json({ error: 'employee_id and name required' });
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `INSERT INTO asset_users (employee_id, name, email, departments, phone_number, job_title, table_number, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?, NOW(), NOW())`,
      [employee_id, name, email || null, departments || null, phone_number || null, job_title || null, table_number || null]
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'employee_id already exists' });
    throw e;
  } finally { conn.release(); }
});

// Update user feature flags (admin)
router.put('/users/:employeeId/features', authRequired, adminRequired, async (req, res) => {
  const { employeeId } = req.params;
  const { has_microsoft_365, has_codium_ememo, has_erp_netsuite } = req.body || {};
  const conn = await pool.getConnection();
  try {
    const [exists] = await conn.query('SELECT id FROM asset_users WHERE employee_id=?', [employeeId]);
    if (exists.length === 0) return res.status(404).json({ error: 'User not found' });
    await conn.query(
      `UPDATE asset_users SET has_microsoft_365=?, has_codium_ememo=?, has_erp_netsuite=? WHERE employee_id=?`,
      [has_microsoft_365 ? 1 : 0, has_codium_ememo ? 1 : 0, has_erp_netsuite ? 1 : 0, employeeId]
    );
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

module.exports = router;
