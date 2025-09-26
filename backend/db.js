const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
  host: process.env.MYSQL_HOST || 'itppg.com',
  user: process.env.MYSQL_USER || 'misppg_db',
  password: process.env.MYSQL_PASSWORD || 'JNN4ukBSUvnN2WDzLKJE',
  database: process.env.MYSQL_DB || 'misppg_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: true,
};

const pool = mysql.createPool(MYSQL_CONFIG);

function isValidSlug(slug) {
  return typeof slug === 'string' && /^[a-z0-9_]+$/.test(slug);
}

function tableNamesFor(slug) {
  if (!isValidSlug(slug)) throw new Error('Invalid slug');
  const item = `asset_${slug}_item`;
  const txn = `asset_${slug}_transaction`;
  return { item, txn };
}

async function ensureTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS asset_categories (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slug VARCHAR(64) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        employee_id VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(120) NOT NULL,
        email VARCHAR(120) NULL,
        departments VARCHAR(120) NULL,
        phone_number VARCHAR(50) NULL,
        job_title VARCHAR(120) NULL,
        table_number VARCHAR(50) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      
    `);
  } finally {
    conn.release();
  }
}

async function ensureDefaultCategories() {
  const defaults = [
    { slug: 'laptop', name: 'Laptops' },
    { slug: 'monitor', name: 'Monitors' },
    { slug: 'phone', name: 'Mobile Phones' },
  ];
  const conn = await pool.getConnection();
  try {
    for (const d of defaults) {
      const [rows] = await conn.query('SELECT id FROM asset_categories WHERE slug=?', [d.slug]);
      if (rows.length === 0) {
        await conn.query('INSERT INTO asset_categories (slug, name) VALUES (?, ?)', [d.slug, d.name]);
        await createCategoryTables(d.slug);
      }
    }
  } finally {
    conn.release();
  }
}

async function createCategoryTables(slug) {
  const conn = await pool.getConnection();
  try {
    const { item, txn } = tableNamesFor(slug);
    await conn.query(`
      CREATE TABLE IF NOT EXISTS ${item} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        brand VARCHAR(100) NULL,
        serial_number VARCHAR(100) NOT NULL UNIQUE,
        start_date DATE NULL,
        \`condition\` VARCHAR(50) NULL,
        condition_comments TEXT NULL,
        employee_id VARCHAR(50) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS ${txn} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        item_id INT NOT NULL,
        employee_id VARCHAR(50) NULL,
        start_date DATE NOT NULL,
        end_date DATE NULL,
        INDEX (item_id),
        INDEX (employee_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_${slug}_accessory_type (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_${slug}_txn_accessory (
        txn_id INT NOT NULL,
        acc_type_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        PRIMARY KEY (txn_id, acc_type_id),
        INDEX (acc_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    conn.release();
  }
}

async function dropCategoryTables(slug) {
  const conn = await pool.getConnection();
  try {
    const { item, txn } = tableNamesFor(slug);
    await conn.query(`DROP TABLE IF EXISTS ${txn}; DROP TABLE IF EXISTS ${item};`);
  } finally {
    conn.release();
  }
}

async function ensureCategoryItemsHaveEmployeeId() {
  const conn = await pool.getConnection();
  try {
    const [cats] = await conn.query('SELECT slug FROM asset_categories');
    for (const c of cats) {
      const { item, txn } = tableNamesFor(c.slug);
      // Ensure item table has employee_id VARCHAR(50)
      const [colsItem] = await conn.query(
        `SELECT COLUMN_NAME, DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'employee_id'`,
        [item]
      );
      if (colsItem.length === 0) {
        await conn.query(`ALTER TABLE ${item} ADD COLUMN employee_id VARCHAR(50) NULL, ADD INDEX (employee_id)`);
      } else if (colsItem[0].DATA_TYPE !== 'varchar') {
        await conn.query(`ALTER TABLE ${item} MODIFY COLUMN employee_id VARCHAR(50) NULL`);
      }
      // Ensure transaction table has employee_id
      const [colsTxn] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = 'employee_id'`,
        [txn]
      );
      if (colsTxn.length === 0) {
        await conn.query(`ALTER TABLE ${txn} ADD COLUMN employee_id VARCHAR(50) NULL, ADD INDEX (employee_id)`);
      }

      // Ensure per-category accessories tables exist
      await conn.query(`
        CREATE TABLE IF NOT EXISTS asset_${c.slug}_accessory_type (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(120) NOT NULL UNIQUE,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        CREATE TABLE IF NOT EXISTS asset_${c.slug}_txn_accessory (
          txn_id INT NOT NULL,
          acc_type_id INT NOT NULL,
          quantity INT NOT NULL DEFAULT 1,
          PRIMARY KEY (txn_id, acc_type_id),
          INDEX (acc_type_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
      `);
    }
  } finally {
    conn.release();
  }
}

async function dropLegacyLaptopAccessoryColumns() {
  const conn = await pool.getConnection();
  try {
    const slug = 'laptop';
    const { item } = tableNamesFor(slug);
    const legacy = ['has_bag','has_mouse','has_charger','has_windows_license'];
    for (const col of legacy) {
      const [exists] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?`,
        [item, col]
      );
      if (exists.length) {
        try { await conn.query(`ALTER TABLE ${item} DROP COLUMN ${col}`); } catch {}
      }
    }
  } finally {
    conn.release();
  }
}

async function ensureAssetUsersHasJobTitle() {
  const conn = await pool.getConnection();
  try {
    const [cols] = await conn.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_users' AND COLUMN_NAME = 'job_title'`
    );
    if (cols.length === 0) {
      await conn.query("ALTER TABLE asset_users ADD COLUMN job_title VARCHAR(120) NULL AFTER phone_number");
    }

    // Ensure user feature flags
    const featureCols = [
      { name: 'has_microsoft_365', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'has_codium_ememo', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
      { name: 'has_erp_netsuite', def: 'TINYINT(1) NOT NULL DEFAULT 0' },
    ];
    for (const col of featureCols) {
      const [exists] = await conn.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'asset_users' AND COLUMN_NAME = ?`,
        [col.name]
      );
      if (exists.length === 0) {
        await conn.query(`ALTER TABLE asset_users ADD COLUMN ${col.name} ${col.def}`);
      }
    }
  } finally {
    conn.release();
  }
}

async function ensureLicenseTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS asset_license_type (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(120) NOT NULL UNIQUE,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_user_license (
        employee_id VARCHAR(50) NOT NULL,
        license_type_id INT NOT NULL,
        PRIMARY KEY (employee_id, license_type_id),
        INDEX (license_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally {
    conn.release();
  }
}

async function ensureRequestTables() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS asset_request (
        id INT AUTO_INCREMENT PRIMARY KEY,
        requested_by_user_id INT NOT NULL,
        employee_id VARCHAR(50) NOT NULL,
        category_slug VARCHAR(64) NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        notes TEXT NULL,
        status ENUM('pending','fulfilled','rejected') NOT NULL DEFAULT 'pending',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX (status), INDEX (employee_id), INDEX (category_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_request_accessory (
        request_id INT NOT NULL,
        acc_type_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        PRIMARY KEY (request_id, acc_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_request_license (
        request_id INT NOT NULL,
        license_type_id INT NOT NULL,
        PRIMARY KEY (request_id, license_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_request_item (
        id INT AUTO_INCREMENT PRIMARY KEY,
        request_id INT NOT NULL,
        category_slug VARCHAR(64) NOT NULL,
        start_date DATE NULL,
        end_date DATE NULL,
        INDEX (request_id), INDEX (category_slug)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_request_item_accessory (
        request_item_id INT NOT NULL,
        acc_type_id INT NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        PRIMARY KEY (request_item_id, acc_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

      CREATE TABLE IF NOT EXISTS asset_request_item_license (
        request_item_id INT NOT NULL,
        license_type_id INT NOT NULL,
        PRIMARY KEY (request_item_id, license_type_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  } finally { conn.release(); }
}

module.exports = { pool, ensureTables, ensureDefaultCategories, isValidSlug, tableNamesFor, createCategoryTables, dropCategoryTables, ensureCategoryItemsHaveEmployeeId, ensureAssetUsersHasJobTitle, ensureLicenseTables, ensureRequestTables, dropLegacyLaptopAccessoryColumns };
