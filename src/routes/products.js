const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');
const db = require('../db/db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { logAction } = require('../logger');

const router = express.Router();

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// فایل‌ها موقتا در حافظه نگه داشته می‌شوند تا با sharp بهینه‌سازی و سپس روی دیسک ذخیره شوند
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const MAX_DIMENSION = 1400; // حداکثر عرض/ارتفاع خروجی، برای جلوگیری از عکس‌های حجیم
const JPEG_QUALITY = 82;

// تغییر اندازه و فشرده‌سازی خودکار عکس آپلودی، خروجی همیشه jpg با کیفیت مناسب برای وب
async function processAndSaveImage(buffer) {
  const filename = Date.now() + '-' + Math.round(Math.random() * 1e9) + '.jpg';
  const outPath = path.join(uploadDir, filename);
  await sharp(buffer)
    .rotate() // اصلاح خودکار چرخش بر اساس EXIF
    .resize({ width: MAX_DIMENSION, height: MAX_DIMENSION, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outPath);
  return '/uploads/' + filename;
}

function attachCategories(products) {
  if (products.length === 0) return products;
  const ids = products.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const links = db.prepare(`
    SELECT pc.product_id, c.id, c.name, c.slug
    FROM product_categories pc JOIN categories c ON pc.category_id = c.id
    WHERE pc.product_id IN (${placeholders})
  `).all(...ids);
  const map = {};
  links.forEach(l => {
    if (!map[l.product_id]) map[l.product_id] = [];
    map[l.product_id].push({ id: l.id, name: l.name, slug: l.slug });
  });
  return products.map(p => ({ ...p, categories: map[p.id] || [] }));
}

function attachImages(products) {
  if (products.length === 0) return products;
  const ids = products.map(p => p.id);
  const placeholders = ids.map(() => '?').join(',');
  const imgs = db.prepare(`SELECT * FROM product_images WHERE product_id IN (${placeholders}) ORDER BY position ASC, id ASC`).all(...ids);
  const map = {};
  imgs.forEach(i => {
    if (!map[i.product_id]) map[i.product_id] = [];
    map[i.product_id].push({ id: i.id, url: i.url });
  });
  return products.map(p => {
    const images = map[p.id] || [];
    return { ...p, images, image: images[0]?.url || p.image || null };
  });
}

function parseCategoryIds(body) {
  let raw = body.category_ids;
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) raw = [raw];
  return raw.map(Number).filter(n => !Number.isNaN(n));
}

/* ---------------- Categories ---------------- */

router.get('/categories', (req, res) => {
  const cats = db.prepare('SELECT * FROM categories ORDER BY id').all();
  res.json({ categories: cats });
});

router.post('/categories', authRequired, adminRequired, (req, res) => {
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'نام و اسلاگ الزامی است' });
  try {
    const info = db.prepare('INSERT INTO categories (name, slug) VALUES (?, ?)').run(name, slug);
    logAction(req.user, 'افزودن دسته‌بندی', { name, slug });
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    res.status(400).json({ error: 'این دسته‌بندی از قبل وجود دارد' });
  }
});

router.put('/categories/:id', authRequired, adminRequired, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'یافت نشد' });
  const { name, slug } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'نام و اسلاگ الزامی است' });
  try {
    db.prepare('UPDATE categories SET name = ?, slug = ? WHERE id = ?').run(name, slug, req.params.id);
    logAction(req.user, 'ویرایش دسته‌بندی', { old: cat.name, new: name });
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'این نام یا اسلاگ قبلا استفاده شده است' });
  }
});

router.delete('/categories/:id', authRequired, adminRequired, (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id);
  if (!cat) return res.status(404).json({ error: 'یافت نشد' });
  db.prepare('DELETE FROM product_categories WHERE category_id = ?').run(req.params.id);
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  logAction(req.user, 'حذف دسته‌بندی', { name: cat.name });
  res.json({ ok: true });
});

/* ---------------- Products ---------------- */

router.get('/', (req, res) => {
  const { category } = req.query;
  let rows;
  if (category) {
    rows = db.prepare(`
      SELECT DISTINCT p.*
      FROM products p
      JOIN product_categories pc ON pc.product_id = p.id
      JOIN categories c ON c.id = pc.category_id
      WHERE c.slug = ? ORDER BY p.created_at DESC
    `).all(category);
  } else {
    rows = db.prepare('SELECT * FROM products ORDER BY created_at DESC').all();
  }
  res.json({ products: attachImages(attachCategories(rows)) });
});

router.get('/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!p) return res.status(404).json({ error: 'کالا یافت نشد' });
  res.json({ product: attachImages(attachCategories([p]))[0] });
});

router.post('/', authRequired, adminRequired, upload.array('images', 10), async (req, res) => {
  const { name, description, price } = req.body;
  if (!name || !price) return res.status(400).json({ error: 'نام و قیمت الزامی است' });
  if (!req.files || req.files.length === 0) return res.status(400).json({ error: 'حداقل یک عکس برای کالا الزامی است' });
  if (req.files.length > 10) return res.status(400).json({ error: 'حداکثر ۱۰ عکس مجاز است' });

  try {
    const urls = [];
    for (const file of req.files) urls.push(await processAndSaveImage(file.buffer));

    const info = db.prepare(`INSERT INTO products (name, description, price, image) VALUES (?, ?, ?, ?)`)
      .run(name, description || '', Number(price), urls[0]);

    const insertImg = db.prepare('INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)');
    urls.forEach((u, idx) => insertImg.run(info.lastInsertRowid, u, idx));

    const catIds = parseCategoryIds(req.body);
    const insertPC = db.prepare('INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)');
    catIds.forEach(cid => insertPC.run(info.lastInsertRowid, cid));

    logAction(req.user, 'افزودن کالا', { name, price, categories: catIds.length, images: urls.length });
    res.json({ id: info.lastInsertRowid });
  } catch (e) {
    console.error('product image processing error', e);
    res.status(500).json({ error: 'خطا در پردازش عکس‌های کالا' });
  }
});

router.put('/:id', authRequired, adminRequired, upload.array('images', 10), async (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'کالا یافت نشد' });
  const { name, description, price } = req.body;

  try {
    // اگر عکس‌های جدیدی فرستاده شده، جایگزین کامل گالری قبلی می‌شود
    if (req.files && req.files.length > 0) {
      if (req.files.length > 10) return res.status(400).json({ error: 'حداکثر ۱۰ عکس مجاز است' });
      const urls = [];
      for (const file of req.files) urls.push(await processAndSaveImage(file.buffer));
      db.prepare('DELETE FROM product_images WHERE product_id = ?').run(req.params.id);
      const insertImg = db.prepare('INSERT INTO product_images (product_id, url, position) VALUES (?, ?, ?)');
      urls.forEach((u, idx) => insertImg.run(req.params.id, u, idx));
      db.prepare('UPDATE products SET image = ? WHERE id = ?').run(urls[0], req.params.id);
    }

    db.prepare(`UPDATE products SET name=?, description=?, price=? WHERE id=?`)
      .run(name || existing.name, description ?? existing.description, price ? Number(price) : existing.price, req.params.id);

    if (req.body.category_ids !== undefined) {
      const catIds = parseCategoryIds(req.body);
      db.prepare('DELETE FROM product_categories WHERE product_id = ?').run(req.params.id);
      const insertPC = db.prepare('INSERT OR IGNORE INTO product_categories (product_id, category_id) VALUES (?, ?)');
      catIds.forEach(cid => insertPC.run(req.params.id, cid));
    }

    logAction(req.user, 'ویرایش کالا', { id: req.params.id, name });
    res.json({ ok: true });
  } catch (e) {
    console.error('product update error', e);
    res.status(500).json({ error: 'خطا در به‌روزرسانی کالا' });
  }
});

router.delete('/:id', authRequired, adminRequired, (req, res) => {
  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'کالا یافت نشد' });
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  db.prepare('DELETE FROM cart_items WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM product_categories WHERE product_id = ?').run(req.params.id);
  db.prepare('DELETE FROM product_images WHERE product_id = ?').run(req.params.id);
  logAction(req.user, 'حذف کالا', { name: existing.name });
  res.json({ ok: true });
});

module.exports = router;
