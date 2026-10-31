const express = require('express');
const db = require('../db/db');
const { authRequired, adminRequired } = require('../middleware/auth');
const { logAction } = require('../logger');

const router = express.Router();

function getCartForUser(userId) {
  return db.prepare(`
    SELECT ci.id as cart_item_id, ci.quantity, p.id as product_id, p.name, p.price, p.image
    FROM cart_items ci JOIN products p ON ci.product_id = p.id
    WHERE ci.user_id = ?
    ORDER BY ci.created_at DESC
  `).all(userId);
}

// سبد خرید خودم
router.get('/', authRequired, (req, res) => {
  res.json({ items: getCartForUser(req.user.id) });
});

// افزودن به سبد
router.post('/', authRequired, (req, res) => {
  const { product_id, quantity } = req.body;
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ error: 'کالا یافت نشد' });
  const existing = db.prepare('SELECT * FROM cart_items WHERE user_id = ? AND product_id = ?').get(req.user.id, product_id);
  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(quantity || 1, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)').run(req.user.id, product_id, quantity || 1);
  }
  logAction(req.user, 'افزودن به سبد خرید', { product: product.name });
  res.json({ items: getCartForUser(req.user.id) });
});

// حذف از سبد خودم
router.delete('/:cartItemId', authRequired, (req, res) => {
  const item = db.prepare('SELECT ci.*, p.name as product_name FROM cart_items ci JOIN products p ON ci.product_id=p.id WHERE ci.id = ?').get(req.params.cartItemId);
  if (!item || item.user_id !== req.user.id) return res.status(404).json({ error: 'یافت نشد' });
  db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.cartItemId);
  logAction(req.user, 'حذف از سبد خرید (توسط کاربر)', { product: item.product_name });
  res.json({ items: getCartForUser(req.user.id) });
});

// ادمین: مشاهده سبد هر کاربر
router.get('/user/:userId', authRequired, adminRequired, (req, res) => {
  res.json({ items: getCartForUser(req.params.userId) });
});

// ادمین: حذف آیتم از سبد هر کاربر
router.delete('/admin/:cartItemId', authRequired, adminRequired, (req, res) => {
  const item = db.prepare(`
    SELECT ci.*, p.name as product_name, u.first_name, u.last_name
    FROM cart_items ci JOIN products p ON ci.product_id=p.id JOIN users u ON ci.user_id = u.id
    WHERE ci.id = ?
  `).get(req.params.cartItemId);
  if (!item) return res.status(404).json({ error: 'یافت نشد' });
  db.prepare('DELETE FROM cart_items WHERE id = ?').run(req.params.cartItemId);
  logAction(req.user, 'حذف از سبد خرید کاربر (توسط ادمین)', { product: item.product_name, targetUser: `${item.first_name} ${item.last_name}` });
  res.json({ ok: true });
});

module.exports = router;
