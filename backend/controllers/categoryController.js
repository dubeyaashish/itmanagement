const { pool, isValidSlug, createCategoryTables, dropCategoryTables } = require('../db');

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'category';
}

async function listCategories(req, res) {
  const q = (req.query.q || '').toString().trim();
  const page = Math.max(parseInt(req.query.page || '1', 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(req.query.pageSize || '10', 10) || 10, 1), 100);
  const offset = (page - 1) * pageSize;

  const conn = await pool.getConnection();
  try {
    const where = [];
    const params = [];
    if (q) {
      where.push('(slug LIKE ? OR name LIKE ?)');
      const w = `%${q}%`;
      params.push(w, w);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [tc] = await conn.query(`SELECT COUNT(*) AS total FROM asset_categories ${whereSql}`, params);
    const total = tc[0]?.total || 0;
    const [rows] = await conn.query(
      `SELECT id, slug, name, created_at, updated_at
       FROM asset_categories ${whereSql}
       ORDER BY name LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    res.json({ data: rows, total, page, pageSize });
  } finally {
    conn.release();
  }
}

async function createCategory(req, res) {
  const { name, slug: providedSlug } = req.body || {};
  if (!name && !providedSlug) return res.status(400).json({ error: 'name or slug required' });
  const slugRaw = providedSlug || slugify(name);
  const slug = slugRaw.toLowerCase();
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'slug must be a-z, 0-9, _' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT id FROM asset_categories WHERE slug=?', [slug]);
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: 'Category slug already exists' });
    }
    const [result] = await conn.query('INSERT INTO asset_categories (slug, name) VALUES (?, ?)', [slug, name || slug]);
    await createCategoryTables(slug);
    await conn.commit();
    res.status(201).json({ id: result.insertId, slug, name: name || slug });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

async function deleteCategory(req, res) {
  const { slug } = req.params;
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [existing] = await conn.query('SELECT id FROM asset_categories WHERE slug=?', [slug]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ error: 'Not found' });
    }
    await dropCategoryTables(slug);
    await conn.query('DELETE FROM asset_categories WHERE slug=?', [slug]);
    await conn.commit();
    res.json({ ok: true });
  } catch (e) {
    try { await conn.rollback(); } catch {}
    throw e;
  } finally {
    conn.release();
  }
}

module.exports = { listCategories, createCategory, deleteCategory };
