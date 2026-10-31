const jwt = require('jsonwebtoken');
const db = require('../db/db');

function authRequired(req, res, next) {
  const token = req.cookies.token;
  if (!token) return res.status(401).json({ error: 'ورود لازم است' });
  try {
    const payload = jwt.verify(token, require('../jwtSecret'));
    const user = db.prepare('SELECT id, phone, first_name, last_name, role FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'کاربر یافت نشد' });
    req.user = user;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'توکن نامعتبر است' });
  }
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'دسترسی محدود به ادمین' });
  }
  next();
}

module.exports = { authRequired, adminRequired };
