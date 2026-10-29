const session = require("express-session");

class SqliteSessionStore extends session.Store {
  constructor({ db }) {
    super();
    this.db = db;
    this.getStmt = db.prepare("SELECT sess FROM sessions WHERE sid = ? AND expired > ?");
    this.setStmt = db.prepare("INSERT INTO sessions(sid,sess,expired) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expired=excluded.expired");
    this.destroyStmt = db.prepare("DELETE FROM sessions WHERE sid = ?");
    this.pruneStmt = db.prepare("DELETE FROM sessions WHERE expired <= ?");
  }

  get(sid, callback) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      callback(null, row ? JSON.parse(row.sess) : null);
    } catch (error) { callback(error); }
  }

  set(sid, value, callback = () => {}) {
    try {
      const expiry = value.cookie?.expires ? new Date(value.cookie.expires).getTime() : Date.now() + 86400000;
      this.setStmt.run(sid, JSON.stringify(value), expiry);
      this.pruneStmt.run(Date.now());
      callback(null);
    } catch (error) { callback(error); }
  }

  touch(sid, value, callback = () => {}) {
    this.set(sid, value, callback);
  }

  destroy(sid, callback = () => {}) {
    try { this.destroyStmt.run(sid); callback(null); } catch (error) { callback(error); }
  }
}

module.exports = { SqliteSessionStore };
