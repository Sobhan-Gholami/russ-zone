const express = require('express');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const AdmZip = require('adm-zip');
const fs = require('fs');
const path = require('path');
const db = require('../db/db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { logAction } = require('../logger');

const router = express.Router();
router.use(authRequired, adminRequired);

const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads');
const zipUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// لیست کاربران
router.get('/users', (req, res) => {
  const users = db.prepare('SELECT id, phone, first_name, last_name, role, created_at FROM users ORDER BY created_at DESC').all();
  res.json({ users });
});

// تغییر رمز هر کاربری توسط ادمین
router.post('/users/:id/change-password', (req, res) => {
  const { new_password } = req.body;
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'رمز جدید باید حداقل ۶ کاراکتر باشد' });
  }
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'کاربر یافت نشد' });
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.params.id);
  logAction(req.user, 'تغییر رمز عبور کاربر توسط ادمین', { targetUser: `${target.first_name} ${target.last_name}`, targetPhone: target.phone });
  res.json({ ok: true });
});

// تغییر نقش کاربر (ارتقا/تنزل ادمین)
router.post('/users/:id/role', (req, res) => {
  const { role } = req.body;
  if (!['admin', 'member'].includes(role)) return res.status(400).json({ error: 'نقش نامعتبر است' });
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!target) return res.status(404).json({ error: 'کاربر یافت نشد' });
  db.prepare('UPDATE users SET role = ? WHERE id = ?').run(role, req.params.id);
  logAction(req.user, 'تغییر نقش کاربر', { targetUser: `${target.first_name} ${target.last_name}`, newRole: role });
  res.json({ ok: true });
});

// لاگ اتفاقات
router.get('/logs', (req, res) => {
  const logs = db.prepare('SELECT * FROM logs ORDER BY created_at DESC LIMIT 500').all();
  res.json({ logs: logs.map(l => ({ ...l, details: l.details ? JSON.parse(l.details) : null })) });
});

/* ---------------- Backup / Restore (ZIP: database + uploaded images) ---------------- */
// خروجی کامل: یک فایل ZIP شامل db.json (دیتای کامل دیتابیس) + تمام عکس‌های آپلودشده
router.get('/backup', (req, res) => {
  const backup = {
    version: 2,
    exported_at: new Date().toISOString(),
    users: db.prepare('SELECT * FROM users').all(),
    categories: db.prepare('SELECT * FROM categories').all(),
    products: db.prepare('SELECT * FROM products').all(),
    product_images: db.prepare('SELECT * FROM product_images').all(),
    product_categories: db.prepare('SELECT * FROM product_categories').all(),
    cart_items: db.prepare('SELECT * FROM cart_items').all(),
    orders: db.prepare('SELECT * FROM orders').all(),
    logs: db.prepare('SELECT * FROM logs').all(),
  };

  const zip = new AdmZip();
  zip.addFile('db.json', Buffer.from(JSON.stringify(backup, null, 2)));

  if (fs.existsSync(uploadDir)) {
    const files = fs.readdirSync(uploadDir).filter(f => f !== '.gitkeep');
    files.forEach(f => {
      const filePath = path.join(uploadDir, f);
      if (fs.statSync(filePath).isFile()) zip.addLocalFile(filePath, 'uploads');
    });
  }

  logAction(req.user, 'دریافت فایل بکاپ کامل (دیتابیس + عکس‌ها)');
  const buffer = zip.toBuffer();
  res.setHeader('Content-Disposition', `attachment; filename="russzone-backup-${Date.now()}.zip"`);
  res.setHeader('Content-Type', 'application/zip');
  res.send(buffer);
});

// بازیابی کامل از فایل ZIP بکاپ (دیتابیس + عکس‌ها جایگزین وضعیت فعلی می‌شوند)
router.post('/restore', zipUpload.single('backup'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'فایل بکاپ (zip) ارسال نشده است' });

  let data;
  try {
    const zip = new AdmZip(req.file.buffer);
    const dbEntry = zip.getEntry('db.json');
    if (!dbEntry) return res.status(400).json({ error: 'فایل بکاپ معتبر نیست: db.json یافت نشد' });
    data = JSON.parse(zip.readAsText(dbEntry));
    if (!Array.isArray(data.users) || !Array.isArray(data.products)) {
      return res.status(400).json({ error: 'فایل بکاپ معتبر نیست' });
    }

    // بازنویسی عکس‌ها روی دیسک از داخل زیپ
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    const imageEntries = zip.getEntries().filter(e => !e.isDirectory && e.entryName.startsWith('uploads/'));
    imageEntries.forEach(entry => {
      const filename = path.basename(entry.entryName);
      fs.writeFileSync(path.join(uploadDir, filename), entry.getData());
    });

    db.exec('BEGIN TRANSACTION');
    // ترتیب حذف با توجه به وابستگی‌های خارجی
    db.exec('DELETE FROM logs');
    db.exec('DELETE FROM cart_items');
    db.exec('DELETE FROM orders');
    db.exec('DELETE FROM product_categories');
    db.exec('DELETE FROM product_images');
    db.exec('DELETE FROM products');
    db.exec('DELETE FROM categories');
    db.exec('DELETE FROM users');

    const insUser = db.prepare(`INSERT INTO users (id, phone, first_name, last_name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`);
    (data.users || []).forEach(u => insUser.run(u.id, u.phone, u.first_name, u.last_name, u.password_hash, u.role, u.created_at));

    const insCat = db.prepare(`INSERT INTO categories (id, name, slug) VALUES (?, ?, ?)`);
    (data.categories || []).forEach(c => insCat.run(c.id, c.name, c.slug));

    const insProd = db.prepare(`INSERT INTO products (id, name, description, price, image, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    (data.products || []).forEach(p => insProd.run(p.id, p.name, p.description, p.price, p.image, p.created_at));

    const insImg = db.prepare(`INSERT INTO product_images (id, product_id, url, position) VALUES (?, ?, ?, ?)`);
    (data.product_images || []).forEach(im => insImg.run(im.id, im.product_id, im.url, im.position));

    const insPC = db.prepare(`INSERT INTO product_categories (product_id, category_id) VALUES (?, ?)`);
    (data.product_categories || []).forEach(pc => insPC.run(pc.product_id, pc.category_id));

    const insCart = db.prepare(`INSERT INTO cart_items (id, user_id, product_id, quantity, created_at) VALUES (?, ?, ?, ?, ?)`);
    (data.cart_items || []).forEach(ci => insCart.run(ci.id, ci.user_id, ci.product_id, ci.quantity, ci.created_at));

    const insOrder = db.prepare(`INSERT INTO orders (id, order_code, user_id, items_json, total, status, cancel_reason, confirmed_at, confirmed_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    (data.orders || []).forEach(o => insOrder.run(o.id, o.order_code, o.user_id, o.items_json, o.total, o.status, o.cancel_reason || null, o.confirmed_at, o.confirmed_by, o.created_at));

    const insLog = db.prepare(`INSERT INTO logs (id, actor_id, actor_name, action, details, created_at) VALUES (?, ?, ?, ?, ?, ?)`);
    (data.logs || []).forEach(l => insLog.run(l.id, l.actor_id, l.actor_name, l.action, l.details, l.created_at));

    db.exec('COMMIT');
    logAction(req.user, 'بازیابی کامل از فایل بکاپ (دیتابیس + عکس‌ها)', { users: data.users.length, products: data.products.length, images: imageEntries.length });
    res.json({
      ok: true,
      restored: { users: data.users.length, products: data.products.length, orders: (data.orders || []).length, images: imageEntries.length }
    });
  } catch (e) {
    try { db.exec('ROLLBACK'); } catch (_) {}
    console.error('restore error', e);
    res.status(500).json({ error: 'خطا در بازیابی: ' + e.message });
  }
});

module.exports = router;
