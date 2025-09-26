const express = require('express');
const { pool, isValidSlug, tableNamesFor } = require('../db');
const { authRequired, adminRequired, hrOrAdminRequired } = require('../middleware/auth');

const router = express.Router();

router.get('/requests', authRequired, hrOrAdminRequired, async (req, res) => {
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const status = (req.query.status || '').toString().trim();
  const offset = (page - 1) * pageSize;
  const conn = await pool.getConnection();
  try {
    const params = [];
    const wh = [];
    if (status) { wh.push('r.status=?'); params.push(status); }
    if (req.user.role !== 'admin') { wh.push('r.requested_by_user_id=?'); params.push(req.user.id); }
    const whereSql = wh.length ? `WHERE ${wh.join(' AND ')}` : '';
    const [tc] = await conn.query(`SELECT COUNT(*) AS total FROM asset_request r ${whereSql}`, params);
    const total = tc[0]?.total || 0;
    const [rows] = await conn.query(
      `SELECT r.*, au.email AS requester_email, u.name AS employee_name, u.email AS employee_email,
              (SELECT GROUP_CONCAT(DISTINCT ri.category_slug) FROM asset_request_item ri WHERE ri.request_id=r.id) AS categories
       FROM asset_request r
       LEFT JOIN auth_users au ON au.id = r.requested_by_user_id
       LEFT JOIN asset_users u ON u.employee_id = r.employee_id
       ${whereSql} ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ data: rows, total, page, pageSize });
  } finally { conn.release(); }
});

// Request detail
router.get('/requests/:id', authRequired, hrOrAdminRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const conn = await pool.getConnection();
  try {
    // base request with requester and employee info
    const [rows] = await conn.query(
      `SELECT r.*, au.email AS requester_email,
              u.name AS employee_name, u.email AS employee_email, u.departments, u.job_title
       FROM asset_request r
       LEFT JOIN auth_users au ON au.id = r.requested_by_user_id
       LEFT JOIN asset_users u ON u.employee_id = r.employee_id
       WHERE r.id=? LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Not found' });
    const request = rows[0];

    // items for this request
    const [itemsRows] = await conn.query(
      `SELECT ri.*, c.name AS category_name
       FROM asset_request_item ri
       LEFT JOIN asset_categories c ON c.slug = ri.category_slug
       WHERE ri.request_id=?
       ORDER BY ri.id`,
      [id]
    );

    // accessories per item require per-category tables
    const bySlug = {};
    for (const it of itemsRows) {
      if (!bySlug[it.category_slug]) bySlug[it.category_slug] = [];
      bySlug[it.category_slug].push(it.id);
    }
    const itemAccMap = {};
    for (const slug of Object.keys(bySlug)) {
      const ids = bySlug[slug];
      if (!ids.length) continue;
      const placeholders = ids.map(() => '?').join(',');
      const [accRows] = await conn.query(
        `SELECT ia.request_item_id, t.name, ia.quantity
         FROM asset_request_item_accessory ia
         JOIN asset_${slug}_accessory_type t ON t.id = ia.acc_type_id
         WHERE ia.request_item_id IN (${placeholders})`,
        ids
      );
      for (const r of accRows) {
        if (!itemAccMap[r.request_item_id]) itemAccMap[r.request_item_id] = [];
        itemAccMap[r.request_item_id].push({ name: r.name, quantity: r.quantity });
      }
    }

    // licenses per item (global table)
    const itemIds = itemsRows.map(i => i.id);
    const itemLicMap = {};
    if (itemIds.length) {
      const [licRows] = await conn.query(
        `SELECT il.request_item_id, lt.name
         FROM asset_request_item_license il
         JOIN asset_license_type lt ON lt.id = il.license_type_id
         WHERE il.request_item_id IN (${itemIds.map(()=>'?').join(',')})`,
        itemIds
      );
      for (const r of licRows) {
        if (!itemLicMap[r.request_item_id]) itemLicMap[r.request_item_id] = [];
        itemLicMap[r.request_item_id].push({ name: r.name });
      }
    }

    // attach arrays to items
    const items = itemsRows.map(it => ({
      id: it.id,
      category_slug: it.category_slug,
      category_name: it.category_name,
      start_date: it.start_date,
      end_date: it.end_date,
      accessories: itemAccMap[it.id] || [],
      licenses: itemLicMap[it.id] || [],
    }));

    // legacy request-level accessories/licenses
    let legacyAccessories = [];
    if (request.category_slug) {
      const [ra] = await conn.query(
        `SELECT t.name, a.quantity
         FROM asset_request_accessory a
         JOIN asset_${request.category_slug}_accessory_type t ON t.id = a.acc_type_id
         WHERE a.request_id=?`,
        [id]
      );
      legacyAccessories = ra.map(r => ({ name: r.name, quantity: r.quantity }));
    }
    const [rl] = await conn.query(
      `SELECT lt.name
       FROM asset_request_license l
       JOIN asset_license_type lt ON lt.id = l.license_type_id
       WHERE l.request_id=?`,
      [id]
    );
    const legacyLicenses = rl.map(r => ({ name: r.name }));

    res.json({ request, items, legacy: { accessories: legacyAccessories, licenses: legacyLicenses } });
  } finally { conn.release(); }
});

router.post('/requests', authRequired, hrOrAdminRequired, async (req, res) => {
  const payload = req.body || {};
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Normalize input: prefer batch users; support top-level { employee/employee_id, items }
    let usersInput = null;
    if (Array.isArray(payload.users) && payload.users.length) {
      usersInput = payload.users;
    } else if (Array.isArray(payload.items) && payload.items.length && (payload.employee_id || payload.employee)) {
      usersInput = [{ employee_id: payload.employee_id, employee: payload.employee, items: payload.items, notes: payload.notes }];
    }

    // Batch mode: multiple users and multiple items per user
    if (Array.isArray(usersInput) && usersInput.length) {
      const created = [];
      for (const u of usersInput) {
        // determine employee
        const emp = u.employee || {};
        const empId = (u.employee_id || emp.employee_id || '').toString().trim();
        if (!empId) {
          await conn.rollback();
          return res.status(400).json({ error: 'users[*].employee_id required' });
        }
        // ensure user exists (create if new)
        const [exists] = await conn.query('SELECT id FROM asset_users WHERE employee_id=?', [empId]);
        if (!exists.length) {
          const name = (emp.name || u.name || empId).toString().trim();
          const email = (emp.email || u.email || null) || null;
          const departments = (emp.departments || u.departments || null) || null;
          const phone = (emp.phone_number || u.phone_number || null) || null;
          const jobTitle = (emp.job_title || u.job_title || null) || null;
          const tableNumber = (emp.table_number || u.table_number || null) || null;
          await conn.query(
            `INSERT INTO asset_users (employee_id, name, email, departments, phone_number, job_title, table_number, created_at, updated_at)
             VALUES (?,?,?,?,?,?,?, NOW(), NOW())`,
            [empId, name, email, departments, phone, jobTitle, tableNumber]
          );
        }

        const items = Array.isArray(u.items) ? u.items : [];
        if (!items.length) {
          await conn.rollback();
          return res.status(400).json({ error: 'users[*].items required' });
        }
        if (!isValidSlug(items[0].category_slug)) {
          await conn.rollback();
          return res.status(400).json({ error: 'users[*].items[0].category_slug invalid' });
        }

        // create parent request (category_slug, start/end from first item to satisfy NOT NULL)
        const first = items[0];
        const [ins] = await conn.query(
          `INSERT INTO asset_request (requested_by_user_id, employee_id, category_slug, start_date, end_date, notes)
           VALUES (?,?,?,?,?,?)`,
          [
            req.user.id,
            empId,
            first.category_slug,
            first.start_date || null,
            first.end_date || null,
            u.notes || payload.notes || null,
          ]
        );
        const requestId = ins.insertId;

        // per-item details
        for (const it of items) {
          if (!isValidSlug(it.category_slug)) continue;
          const [ri] = await conn.query(
            `INSERT INTO asset_request_item (request_id, category_slug, start_date, end_date)
             VALUES (?,?,?,?)`,
            [requestId, it.category_slug, it.start_date || null, it.end_date || null]
          );
          const requestItemId = ri.insertId;

          // accessories per item
          if (Array.isArray(it.accessories) && it.accessories.length) {
            for (const a of it.accessories) {
              let typeId = a.type_id;
              const qty = Math.max(parseInt(a.quantity || 1, 10) || 1, 1);
              if (!typeId && a.name) {
                const [ex] = await conn.query(`SELECT id FROM asset_${it.category_slug}_accessory_type WHERE name=?`, [a.name]);
                if (ex.length) typeId = ex[0].id; else {
                  const [crt] = await conn.query(`INSERT INTO asset_${it.category_slug}_accessory_type (name) VALUES (?)`, [a.name]);
                  typeId = crt.insertId;
                }
              }
              if (typeId) await conn.query(
                'INSERT INTO asset_request_item_accessory (request_item_id, acc_type_id, quantity) VALUES (?,?,?)',
                [requestItemId, typeId, qty]
              );
            }
          }

          // licenses per item
          if (Array.isArray(it.licenses) && it.licenses.length) {
            for (const l of it.licenses) {
              let typeId = l.type_id;
              if (!typeId && l.name) {
                const [ex] = await conn.query('SELECT id FROM asset_license_type WHERE name=?', [l.name]);
                if (ex.length) typeId = ex[0].id; else {
                  const [crt] = await conn.query('INSERT INTO asset_license_type (name) VALUES (?)', [l.name]);
                  typeId = crt.insertId;
                }
              }
              if (typeId) await conn.query(
                'INSERT INTO asset_request_item_license (request_item_id, license_type_id) VALUES (?,?)',
                [requestItemId, typeId]
              );
            }
          }
        }

        created.push({ request_id: requestId, employee_id: empId });
      }
      await conn.commit();
      return res.status(201).json({ ok: true, created });
    }

    // Legacy mode: single employee and single category (backwards compatible)
    const { employee_id, category_slug, start_date, end_date, notes, accessories, licenses } = payload;
    if (!employee_id || !isValidSlug(category_slug)) {
      await conn.rollback();
      return res.status(400).json({ error: 'employee_id and valid category_slug required' });
    }
    const [emp] = await conn.query('SELECT employee_id FROM asset_users WHERE employee_id=?', [employee_id]);
    if (!emp.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Employee not found' });
    }
    const [ins] = await conn.query(
      `INSERT INTO asset_request (requested_by_user_id, employee_id, category_slug, start_date, end_date, notes)
       VALUES (?,?,?,?,?,?)`,
      [req.user.id, employee_id, category_slug, start_date || null, end_date || null, notes || null]
    );
    const requestId = ins.insertId;
    if (Array.isArray(accessories) && accessories.length) {
      for (const a of accessories) {
        let typeId = a.type_id;
        const qty = Math.max(parseInt(a.quantity || 1, 10) || 1, 1);
        if (!typeId && a.name) {
          const [ex] = await conn.query(`SELECT id FROM asset_${category_slug}_accessory_type WHERE name=?`, [a.name]);
          if (ex.length) typeId = ex[0].id; else {
            const [crt] = await conn.query(`INSERT INTO asset_${category_slug}_accessory_type (name) VALUES (?)`, [a.name]);
            typeId = crt.insertId;
          }
        }
        if (typeId) await conn.query('INSERT INTO asset_request_accessory (request_id, acc_type_id, quantity) VALUES (?,?,?)', [requestId, typeId, qty]);
      }
    }
    if (Array.isArray(licenses) && licenses.length) {
      for (const l of licenses) {
        let typeId = l.type_id;
        if (!typeId && l.name) {
          const [ex] = await conn.query('SELECT id FROM asset_license_type WHERE name=?', [l.name]);
          if (ex.length) typeId = ex[0].id; else {
            const [crt] = await conn.query('INSERT INTO asset_license_type (name) VALUES (?)', [l.name]);
            typeId = crt.insertId;
          }
        }
        if (typeId) await conn.query('INSERT INTO asset_request_license (request_id, license_type_id) VALUES (?,?)', [requestId, typeId]);
      }
    }
    await conn.commit();
    return res.status(201).json({ id: requestId });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally { conn.release(); }
});

router.put('/requests/:id/status', authRequired, adminRequired, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const status = (req.body?.status || '').toString().toLowerCase();
  if (!['pending','fulfilled','rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const conn = await pool.getConnection();
  try {
    const [aff] = await conn.query('UPDATE asset_request SET status=?, updated_at=NOW() WHERE id=?', [status, id]);
    if (!aff.affectedRows) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } finally { conn.release(); }
});

router.get('/requests/pending_count', authRequired, adminRequired, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const [r] = await conn.query(`SELECT COUNT(*) AS cnt FROM asset_request WHERE status='pending'`);
    res.json({ count: r[0]?.cnt || 0 });
  } finally { conn.release(); }
});

module.exports = router;
