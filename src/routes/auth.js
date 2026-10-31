const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/db');
const { authRequired } = require('../middleware/auth');
const { logAction } = require('../logger');

const router = express.Router();

function sign(user) {
  return jwt.sign({ id: user.id }, require('../jwtSecret'), { expiresIn: '30d' });
}

// ثبت نام
router.post('/register', (req, res) => {
  const { phone, first_name, last_name, password, confirm_password } = req.body;
  if (!phone || !first_name || !last_name || !password || !confirm_password) {
    return res.status(400).json({ error: 'همه فیلدها الزامی است' });
  }
  if (!/^09\d{9}$/.test(phone)) {
    return res.status(400).json({ error: 'شماره تماس معتبر نیست (مثال: 09121234567)' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'رمز عبور باید حداقل ۶ کاراکتر باشد' });
  }
  if (password !== confirm_password) {
    return res.status(400).json({ error: 'تکرار رمز عبور مطابقت ندارد' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (exists) return res.status(400).json({ error: 'این شماره قبلا ثبت نام کرده است' });

  const hash = bcrypt.hashSync(password, 10);
  const info = db.prepare(`INSERT INTO users (phone, first_name, last_name, password_hash, role) VALUES (?, ?, ?, ?, 'member')`)
    .run(phone, first_name, last_name, hash);
  const user = db.prepare('SELECT id, phone, first_name, last_name, role FROM users WHERE id = ?').get(info.lastInsertRowid);
  logAction(user, 'ثبت‌نام کاربر جدید', { phone });

  const token = sign(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  res.json({ user });
});

// ورود
router.post('/login', (req, res) => {
  const { phone, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(400).json({ error: 'شماره تماس یا رمز عبور اشتباه است' });
  }
  const token = sign(user);
  res.cookie('token', token, { httpOnly: true, maxAge: 30 * 24 * 3600 * 1000, sameSite: 'lax' });
  logAction(user, 'ورود کاربر');
  res.json({ user: { id: user.id, phone: user.phone, first_name: user.first_name, last_name: user.last_name, role: user.role } });
});

// خروج
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

// دریافت پروفایل
router.get('/me', authRequired, (req, res) => {
  res.json({ user: req.user });
});

// تغییر رمز توسط خود کاربر
router.post('/change-password', authRequired, (req, res) => {
  const { current_password, new_password, confirm_password } = req.body;
  const dbUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password || '', dbUser.password_hash)) {
    return res.status(400).json({ error: 'رمز عبور فعلی اشتباه است' });
  }
  if (!new_password || new_password.length < 6) {
    return res.status(400).json({ error: 'رمز جدید باید حداقل ۶ کاراکتر باشد' });
  }
  if (new_password !== confirm_password) {
    return res.status(400).json({ error: 'تکرار رمز جدید مطابقت ندارد' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, req.user.id);
  logAction(req.user, 'تغییر رمز عبور توسط خود کاربر');
  res.json({ ok: true });
});

module.exports = router;
