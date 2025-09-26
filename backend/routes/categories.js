const express = require('express');
const { pool, isValidSlug, tableNamesFor } = require('../db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { listCategories, createCategory, deleteCategory } = require('../controllers/categoryController');

const router = express.Router();

// Category management
router.get('/categories', authRequired, listCategories);
router.post('/categories', authRequired, adminRequired, createCategory);
router.delete('/categories/:slug', authRequired, adminRequired, deleteCategory);

// Accessory types per category
router.get('/categories/:slug/accessories', authRequired, async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`SELECT id, name FROM asset_${slug}_accessory_type ORDER BY name`);
    res.json(rows);
  } finally { conn.release(); }
});

router.post('/categories/:slug/accessories', authRequired, adminRequired, async (req, res) => {
  const { slug } = req.params;
  const { name } = req.body || {};
  if (!isValidSlug(slug) || !name) return res.status(400).json({ error: 'Invalid input' });
  const conn = await pool.getConnection();
  try {
    await conn.query(`INSERT INTO asset_${slug}_accessory_type (name) VALUES (?)`, [name]);
    res.status(201).json({ ok: true });
  } finally { conn.release(); }
});

router.delete('/categories/:slug/accessories/:id', authRequired, adminRequired, async (req, res) => {
  const { slug, id } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const conn = await pool.getConnection();
  try {
    await conn.query(`DELETE FROM asset_${slug}_accessory_type WHERE id=?`, [id]);
    res.json({ ok: true });
  } finally { conn.release(); }
});

// Stats: item counts per category (admin: all items; user: only assigned)
router.get('/categories/stats', authRequired, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [cats] = await conn.query('SELECT slug, name FROM asset_categories ORDER BY name');
    const isAdmin = req.user.role === 'admin';
    let myEmpId = null;
    if (!isAdmin) {
      const [me] = await conn.query('SELECT employee_id FROM asset_users WHERE email=? LIMIT 1', [req.user.username]);
      myEmpId = me[0]?.employee_id || null;
    }
    const results = [];
    for (const c of cats) {
      const tnames = tableNamesFor(c.slug);
      let count = 0;
      if (isAdmin) {
        const [r] = await conn.query(`SELECT COUNT(*) AS cnt FROM ${tnames.item}`);
        count = r[0].cnt || 0;
      } else {
        if (myEmpId) {
          const [r] = await conn.query(
            `SELECT COUNT(DISTINCT i.id) AS cnt FROM ${tnames.item} i JOIN ${tnames.txn} h ON h.item_id=i.id
             WHERE h.employee_id=? AND (h.end_date IS NULL OR h.end_date >= CURDATE())`,
            [myEmpId]
          );
          count = r[0].cnt || 0;
        } else {
          count = 0;
        }
      }
      results.push({ slug: c.slug, name: c.name, count });
    }
    res.json(results);
  } finally {
    conn.release();
  }
});

// Items per category
router.get('/categories/:slug/items', authRequired, async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { item, txn } = tableNamesFor(slug);
  const q = (req.query.q || '').toString().trim();
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const offset = (page - 1) * pageSize;
  const conn = await pool.getConnection();
  try {
    let rows;
    let total = 0;
    const filters = [];
    const params = [];
    if (q) {
      filters.push('(i.brand LIKE ? OR i.serial_number LIKE ? OR i.`condition` LIKE ? OR au.name LIKE ? OR au.email LIKE ?)');
      const w = `%${q}%`;
      params.push(w, w, w, w, w);
    }
    const whereExtra = filters.length ? ` AND ${filters.join(' AND ')}` : '';
    if (req.user.role === 'admin') {
      const [tc] = await conn.query(
        `SELECT COUNT(*) AS total FROM ${item} i LEFT JOIN asset_users au ON au.employee_id = i.employee_id WHERE 1=1 ${whereExtra}`,
        params
      );
      total = tc[0]?.total || 0;
      [rows] = await conn.query(
        `SELECT i.*, au.name AS employee_name, au.email AS employee_email
         FROM ${item} i LEFT JOIN asset_users au ON au.employee_id = i.employee_id
         WHERE 1=1 ${whereExtra}
         ORDER BY i.updated_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset]
      );
    } else {
      const [me] = await conn.query('SELECT employee_id FROM asset_users WHERE email=? LIMIT 1', [req.user.username]);
      const myEmpId = me[0]?.employee_id || null;
      if (!myEmpId) return res.json({ data: [], total: 0, page, pageSize });
      const [tc] = await conn.query(
        `SELECT COUNT(DISTINCT i.id) AS total FROM ${item} i JOIN ${txn} h ON h.item_id=i.id
         LEFT JOIN asset_users au ON au.employee_id = i.employee_id
         WHERE h.employee_id=? AND (h.end_date IS NULL OR h.end_date >= CURDATE()) ${whereExtra}`,
        [myEmpId, ...params]
      );
      total = tc[0]?.total || 0;
      [rows] = await conn.query(
        `SELECT i.*, au.name AS employee_name, au.email AS employee_email FROM ${item} i JOIN ${txn} h ON h.item_id=i.id
         LEFT JOIN asset_users au ON au.employee_id = i.employee_id
         WHERE h.employee_id=? AND (h.end_date IS NULL OR h.end_date >= CURDATE()) ${whereExtra}
         ORDER BY i.updated_at DESC, i.id DESC LIMIT ? OFFSET ?`,
        [myEmpId, ...params, pageSize, offset]
      );
    }
    res.json({ data: rows, total, page, pageSize });
  } finally {
    conn.release();
  }
});

router.post('/categories/:slug/items', authRequired, adminRequired, async (req, res) => {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { brand, serial_number, start_date, condition, condition_comments } = req.body || {};
  if (!serial_number) return res.status(400).json({ error: 'serial_number required' });
  const { item } = tableNamesFor(slug);
  const conn = await pool.getConnection();
  try {
    const [result] = await conn.query(
      `INSERT INTO ${item} (brand, serial_number, start_date, \`condition\`, condition_comments, created_at, updated_at)
       VALUES (?,?,?,?,?, NOW(), NOW())`,
      [brand || null, serial_number, start_date || null, condition || null, condition_comments || null]
    );
    res.status(201).json({ id: result.insertId });
  } catch (e) {
    if (e && e.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'Serial already exists' });
    throw e;
  } finally {
    conn.release();
  }
});

router.get('/categories/:slug/items/:id', authRequired, async (req, res) => {
  const { slug, id } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { item, txn } = tableNamesFor(slug);
  const conn = await pool.getConnection();
  const histPage = Math.max(parseInt(req.query.hist_page || '1', 10) || 1, 1);
  const histPageSize = Math.min(Math.max(parseInt(req.query.hist_page_size || '10', 10) || 10, 1), 100);
  const histOffset = (histPage - 1) * histPageSize;
  try {
    const [items] = await conn.query(`SELECT i.*, au.name AS employee_name, au.email AS employee_email FROM ${item} i LEFT JOIN asset_users au ON au.employee_id = i.employee_id WHERE i.id=?`, [id]);
    const row = items[0];
    if (!row) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin') {
      const [me] = await conn.query('SELECT employee_id FROM asset_users WHERE email=? LIMIT 1', [req.user.username]);
      const myEmpId = me[0]?.employee_id || null;
      if (!myEmpId) return res.status(403).json({ error: 'Not allowed' });
      const [rows] = await conn.query(
        `SELECT 1 FROM ${txn} WHERE item_id=? AND employee_id=? AND (end_date IS NULL OR end_date > CURDATE())`,
        [id, myEmpId]
      );
      if (rows.length === 0) return res.status(403).json({ error: 'Not allowed' });
    }
    const [hc] = await conn.query(`SELECT COUNT(*) AS total FROM ${txn} WHERE item_id=?`, [id]);
    const historyTotal = hc[0]?.total || 0;
    const [history] = await conn.query(
      `SELECT h.*, au.name AS employee_name, au.email AS employee_email FROM ${txn} h LEFT JOIN asset_users au ON au.employee_id=h.employee_id WHERE h.item_id=? ORDER BY h.start_date DESC, h.id DESC LIMIT ? OFFSET ?`,
      [id, histPageSize, histOffset]
    );
    const ids = history.map(h => h.id);
    let accMap = {};
    if (ids.length) {
      const [accRows] = await conn.query(
        `SELECT ta.txn_id, t.name, ta.quantity FROM asset_${slug}_txn_accessory ta JOIN asset_${slug}_accessory_type t ON t.id=ta.acc_type_id WHERE ta.txn_id IN (${ids.map(()=>'?').join(',')})`,
        ids
      );
      for (const r of accRows) {
        if (!accMap[r.txn_id]) accMap[r.txn_id] = [];
        accMap[r.txn_id].push({ name: r.name, quantity: r.quantity });
      }
    }
    for (const h of history) h.accessories = accMap[h.id] || [];
    res.json({ item: row, history, history_meta: { total: historyTotal, page: histPage, pageSize: histPageSize } });
  } finally {
    conn.release();
  }
});

router.put('/categories/:slug/items/:id', authRequired, adminRequired, async (req, res) => {
  const { slug, id } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { item } = tableNamesFor(slug);
  const { brand, serial_number, start_date, condition, condition_comments } = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.query(
      `UPDATE ${item} SET brand=?, serial_number=?, start_date=?, \`condition\`=?, condition_comments=?, updated_at=NOW() WHERE id=?`,
      [brand || null, serial_number, start_date || null, condition || null, condition_comments || null, id]
    );
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

router.post('/categories/:slug/items/:id/transactions', authRequired, adminRequired, async (req, res) => {
  const { slug, id } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { txn } = tableNamesFor(slug);
  const { employee_id, start_date, end_date, accessories } = req.body || {};
  if (!employee_id || !start_date) return res.status(400).json({ error: 'employee_id and start_date required' });
  const conn = await pool.getConnection();
  try {
    // block if there is already an active assignment
    const [act] = await conn.query(`SELECT 1 FROM ${txn} WHERE item_id=? AND (end_date IS NULL OR end_date > CURDATE()) LIMIT 1`, [id]);
    if (act.length) return res.status(409).json({ error: 'Active assignment exists. End it first.' });
    const [users] = await conn.query('SELECT employee_id FROM asset_users WHERE employee_id=?', [employee_id]);
    if (users.length === 0) return res.status(404).json({ error: 'User not found' });
    const [ins] = await conn.query(`INSERT INTO ${txn} (item_id, employee_id, start_date, end_date) VALUES (?,?,?,?)`, [id, employee_id, start_date, end_date || null]);
    const txnId = ins.insertId;
    if (Array.isArray(accessories) && accessories.length) {
      for (const a of accessories) {
        let typeId = a.type_id;
        const qty = Math.max(parseInt(a.quantity || 1, 10) || 1, 1);
        if (!typeId && a.name) {
          const [exists] = await conn.query(`SELECT id FROM asset_${slug}_accessory_type WHERE name=?`, [a.name]);
          if (exists.length) typeId = exists[0].id; else {
            const [crt] = await conn.query(`INSERT INTO asset_${slug}_accessory_type (name) VALUES (?)`, [a.name]);
            typeId = crt.insertId;
          }
        }
        if (typeId) {
          await conn.query(`INSERT INTO asset_${slug}_txn_accessory (txn_id, acc_type_id, quantity) VALUES (?,?,?)`, [txnId, typeId, qty]);
        }
      }
    }
    // Update current holder based on the most recent active transaction
    const [active] = await conn.query(
      `SELECT employee_id FROM ${txn} WHERE item_id=? AND (end_date IS NULL OR end_date > CURDATE()) ORDER BY start_date DESC, id DESC LIMIT 1`,
      [id]
    );
    const currentEmpId = active.length ? active[0].employee_id : null;
    const { item } = tableNamesFor(slug);
    await conn.query(`UPDATE ${item} SET employee_id=? WHERE id=?`, [currentEmpId, id]);
    res.status(201).json({ ok: true });
  } finally {
    conn.release();
  }
});

// End current active assignment (admin)
router.put('/categories/:slug/items/:id/transactions/end', authRequired, adminRequired, async (req, res) => {
  const { slug, id } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const { txn, item } = tableNamesFor(slug);
  const endDate = req.body?.end_date || new Date().toISOString().slice(0,10);
  const conn = await pool.getConnection();
  try {
    // End ALL active assignments for this item to prevent overlaps
    await conn.query(
      `UPDATE ${txn} SET end_date=? WHERE item_id=? AND (end_date IS NULL OR end_date > CURDATE())`,
      [endDate, id]
    );
    // Update current holder after ending
    const [active] = await conn.query(
      `SELECT employee_id FROM ${txn} WHERE item_id=? AND (end_date IS NULL OR end_date > CURDATE()) ORDER BY start_date DESC, id DESC LIMIT 1`,
      [id]
    );
    const currentEmpId = active.length ? active[0].employee_id : null;
    await conn.query(`UPDATE ${item} SET employee_id=? WHERE id=?`, [currentEmpId, id]);
    res.json({ ok: true });
  } finally {
    conn.release();
  }
});

module.exports = router;
