const express = require('express');
const db = require('../db/db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { logAction } = require('../logger');
const { notifyTelegram } = require('../telegram');

const router = express.Router();

function generateOrderCode(orderId) {
  return 'RZ-' + String(orderId).padStart(5, '0');
}

// ثبت سفارش نهایی از سبد خرید فعلی کاربر (بدون درگاه پرداخت) - در حالت "در انتظار تایید ادمین"
router.post('/', authRequired, async (req, res) => {
  const items = db.prepare(`
    SELECT ci.quantity, p.id as product_id, p.name, p.price
    FROM cart_items ci JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = ?
  `).all(req.user.id);

  if (items.length === 0) return res.status(400).json({ error: 'سبد خرید شما خالی است' });

  const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
  const info = db.prepare(`INSERT INTO orders (user_id, items_json, total, status) VALUES (?, ?, ?, 'pending')`)
    .run(req.user.id, JSON.stringify(items), total);

  const orderCode = generateOrderCode(info.lastInsertRowid);
  db.prepare('UPDATE orders SET order_code = ? WHERE id = ?').run(orderCode, info.lastInsertRowid);

  db.prepare('DELETE FROM cart_items WHERE user_id = ?').run(req.user.id);

  logAction(req.user, 'ثبت سفارش جدید', { orderId: info.lastInsertRowid, orderCode, total });

  const supportUsername = process.env.TELEGRAM_SUPPORT_USERNAME || 'your_support_username';
  const itemsList = items.map(i => `• ${i.name} × ${i.quantity} = ${(i.price * i.quantity).toLocaleString('fa-IR')} تومان`).join('\n');
  const text =
    `🛒 <b>سفارش جدید در روس زون</b>\n` +
    `کد سفارش: ${orderCode}\n` +
    `مشتری: ${req.user.first_name} ${req.user.last_name}\n` +
    `شماره تماس: ${req.user.phone}\n\n` +
    `${itemsList}\n\n` +
    `💰 مبلغ کل: ${total.toLocaleString('fa-IR')} تومان\n` +
    `⏳ در انتظار تایید ادمین`;
  await notifyTelegram(text);

  res.json({ orderId: info.lastInsertRowid, orderCode, total, supportUsername });
});

// سفارش‌های خودم (چه در انتظار چه تایید‌شده)
router.get('/mine', authRequired, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(req.user.id);
  res.json({ orders: orders.map(o => ({ ...o, items: JSON.parse(o.items_json) })) });
});

// ادمین: همه سفارش‌ها (در انتظار + تایید‌شده)، با فیلتر اختیاری status
router.get('/', authRequired, adminRequired, (req, res) => {
  const { status } = req.query;
  let orders;
  if (status === 'pending' || status === 'confirmed') {
    orders = db.prepare(`
      SELECT o.*, u.first_name, u.last_name, u.phone
      FROM orders o JOIN users u ON o.user_id = u.id
      WHERE o.status = ?
      ORDER BY o.created_at DESC
    `).all(status);
  } else {
    orders = db.prepare(`
      SELECT o.*, u.first_name, u.last_name, u.phone
      FROM orders o JOIN users u ON o.user_id = u.id
      ORDER BY o.created_at DESC
    `).all();
  }
  res.json({ orders: orders.map(o => ({ ...o, items: JSON.parse(o.items_json) })) });
});

// ادمین: تایید سفارش (انتقال از در انتظار به ثبت‌شده)
router.post('/:id/confirm', authRequired, adminRequired, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'سفارش یافت نشد' });
  if (order.status === 'confirmed') return res.status(400).json({ error: 'این سفارش قبلا تایید شده است' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'این سفارش لغو شده است و قابل تایید نیست' });

  db.prepare(`UPDATE orders SET status = 'confirmed', confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?`)
    .run(`${req.user.first_name} ${req.user.last_name}`, req.params.id);

  logAction(req.user, 'تایید سفارش', { orderId: order.id, orderCode: order.order_code });
  res.json({ ok: true });
});

// ادمین: لغو سفارش همراه با دلیل که به کاربر نمایش داده می‌شود
router.post('/:id/cancel', authRequired, adminRequired, async (req, res) => {
  const order = db.prepare('SELECT o.*, u.first_name, u.last_name, u.phone FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'سفارش یافت نشد' });
  if (order.status === 'cancelled') return res.status(400).json({ error: 'این سفارش قبلا لغو شده است' });
  if (order.status === 'confirmed') return res.status(400).json({ error: 'سفارش‌های تایید‌شده قابل لغو نیستند' });

  const { reason } = req.body;
  if (!reason || !reason.trim()) return res.status(400).json({ error: 'ذکر دلیل لغو الزامی است' });

  db.prepare(`UPDATE orders SET status = 'cancelled', cancel_reason = ?, confirmed_at = datetime('now'), confirmed_by = ? WHERE id = ?`)
    .run(reason.trim(), `${req.user.first_name} ${req.user.last_name}`, req.params.id);

  logAction(req.user, 'لغو سفارش', { orderId: order.id, orderCode: order.order_code, reason: reason.trim() });

  const text =
    `❌ <b>سفارش لغو شد</b>\n` +
    `کد سفارش: ${order.order_code}\n` +
    `مشتری: ${order.first_name} ${order.last_name}\n` +
    `شماره تماس: ${order.phone}\n` +
    `دلیل لغو: ${reason.trim()}`;
  await notifyTelegram(text);

  res.json({ ok: true });
});

module.exports = router;
