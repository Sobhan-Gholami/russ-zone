const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const bcrypt = require('bcryptjs');

const db = new DatabaseSync(path.join(__dirname, 'russzone.db'));
db.exec('PRAGMA journal_mode = WAL;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  phone TEXT UNIQUE NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'member' | 'admin'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  description TEXT,
  price INTEGER NOT NULL,
  image TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  url TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS product_categories (
  product_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  PRIMARY KEY (product_id, category_id),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS cart_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_code TEXT UNIQUE,
  user_id INTEGER NOT NULL,
  items_json TEXT NOT NULL,
  total INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'confirmed' | 'cancelled'
  cancel_reason TEXT,
  confirmed_at TEXT,
  confirmed_by TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
`);

// migration: move legacy single category_id column (older versions) into product_categories
try {
  const cols = db.prepare("PRAGMA table_info(products)").all();
  if (cols.some(c => c.name === 'category_id')) {
    const rows = db.prepare('SELECT id, category_id FROM products WHERE category_id IS NOT NULL').all();
    const insertPC = db.prepare('INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)');
    rows.forEach(r => insertPC.run(r.id, r.category_id));
    db.exec(`
      CREATE TABLE IF NOT EXISTS products_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        price INTEGER NOT NULL,
        image TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      );
      INSERT INTO products_new (id, name, description, price, image, created_at)
        SELECT id, name, description, price, image, created_at FROM products;
      DROP TABLE products;
      ALTER TABLE products_new RENAME TO products;
    `);
  }
} catch (e) { console.error('migration error', e); }

// migration: add order_code/status columns to older orders table if missing
try {
  const ocols = db.prepare("PRAGMA table_info(orders)").all();
  const names = ocols.map(c => c.name);
  if (!names.includes('order_code')) {
    db.exec("ALTER TABLE orders ADD COLUMN order_code TEXT;");
    const rows = db.prepare('SELECT id FROM orders WHERE order_code IS NULL').all();
    const upd = db.prepare('UPDATE orders SET order_code = ? WHERE id = ?');
    rows.forEach(r => upd.run('RZ-' + String(r.id).padStart(5, '0'), r.id));
  }
  if (!names.includes('confirmed_at')) db.exec("ALTER TABLE orders ADD COLUMN confirmed_at TEXT;");
  if (!names.includes('confirmed_by')) db.exec("ALTER TABLE orders ADD COLUMN confirmed_by TEXT;");
  if (!names.includes('cancel_reason')) db.exec("ALTER TABLE orders ADD COLUMN cancel_reason TEXT;");
  // normalize any legacy status values to the new pending/confirmed/cancelled scheme
  db.exec("UPDATE orders SET status = 'pending' WHERE status NOT IN ('pending','confirmed','cancelled');");
} catch (e) { console.error('order migration error', e); }

// migration: seed product_images from the legacy single "image" column for existing products
try {
  const imgRows = db.prepare("SELECT id, image FROM products WHERE image IS NOT NULL AND image != ''").all();
  const existingImgCount = db.prepare('SELECT COUNT(*) c FROM product_images').get().c;
  if (existingImgCount === 0 && imgRows.length > 0) {
    const insertImg = db.prepare('INSERT INTO product_images (product_id, url, position) VALUES (?, ?, 0)');
    imgRows.forEach(r => insertImg.run(r.id, r.image));
  }
} catch (e) { console.error('product_images migration error', e); }

const adminExists = db.prepare('SELECT * FROM users WHERE role = ?').get('admin');
if (!adminExists) {
  const phone = process.env.ADMIN_PHONE || '09120000000';
  const password = process.env.ADMIN_PASSWORD || require('crypto').randomBytes(9).toString('base64url');
  const hash = bcrypt.hashSync(password, 10);
  db.prepare(`INSERT INTO users (phone, first_name, last_name, password_hash, role) VALUES (?, ?, ?, ?, ?)`)
    .run(phone, 'ادمین', 'اصلی', hash, 'admin');
  console.log(`Admin created -> phone: ${phone}` + (process.env.ADMIN_PASSWORD ? '' : ` | generated password: ${password} (change it after first login)`));
}

// seed default categories
const catCount = db.prepare('SELECT COUNT(*) c FROM categories').get().c;
if (catCount === 0) {
  const insertCat = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)');
  insertCat.run('مردانه', 'mens');
  insertCat.run('زنانه', 'womens');
  insertCat.run('بچگانه', 'kids');
  insertCat.run('اکسسوری', 'accessories');
}

module.exports = db;
