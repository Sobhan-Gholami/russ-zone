const db = require('./db/db');

function logAction(actor, action, details) {
  try {
    const stmt = db.prepare(`INSERT INTO logs (actor_id, actor_name, action, details) VALUES (?, ?, ?, ?)`);
    stmt.run(
      actor ? actor.id : null,
      actor ? `${actor.first_name} ${actor.last_name}` : 'سیستم',
      action,
      details ? JSON.stringify(details) : null
    );
  } catch (e) {
    console.error('log error', e);
  }
}

module.exports = { logAction };
