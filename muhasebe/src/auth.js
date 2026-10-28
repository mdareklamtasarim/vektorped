'use strict';
// Passwords (scrypt), cookie sessions and login throttling.
const crypto = require('node:crypto');

const COOKIE = 'mh_sid';
const SESSION_DAYS = 30;
const SCRYPT = { N: 16384, r: 8, p: 1 };

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64, SCRYPT);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  const [scheme, saltB64, hashB64] = String(stored).split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = crypto.scryptSync(password, Buffer.from(saltB64, 'base64'), expected.length, SCRYPT);
  return crypto.timingSafeEqual(expected, actual);
}

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function createSession(db, userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = Date.now() + SESSION_DAYS * 86400e3;
  db.run('DELETE FROM sessions WHERE expires_at < :now', { now: Date.now() });
  db.run('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (:h, :u, :e)', {
    h: sha256(token), u: userId, e: expires,
  });
  return token;
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function sessionUser(db, req) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (!token) return null;
  const row = db.get(
    `SELECT u.id, u.username, u.name, u.role, s.expires_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = :h AND u.active = 1`,
    { h: sha256(token) },
  );
  if (!row || row.expires_at < Date.now()) return null;
  return { id: row.id, username: row.username, name: row.name, role: row.role, tokenHash: sha256(token) };
}

function sessionCookie(token, secure, maxAgeSec = SESSION_DAYS * 86400) {
  return [
    `${COOKIE}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAgeSec}`,
    secure ? 'Secure' : '',
  ].filter(Boolean).join('; ');
}

// Simple in-memory brake on password guessing: 10 failures per IP per 15 minutes.
class LoginThrottle {
  constructor(limit = 10, windowMs = 15 * 60e3) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.fails = new Map();
  }
  blocked(key) {
    const e = this.fails.get(key);
    if (!e) return false;
    if (Date.now() - e.first > this.windowMs) {
      this.fails.delete(key);
      return false;
    }
    return e.count >= this.limit;
  }
  fail(key) {
    const e = this.fails.get(key);
    if (!e || Date.now() - e.first > this.windowMs) this.fails.set(key, { first: Date.now(), count: 1 });
    else e.count++;
  }
  reset(key) {
    this.fails.delete(key);
  }
}

module.exports = {
  COOKIE, hashPassword, verifyPassword, createSession, sessionUser, sessionCookie, sha256, LoginThrottle,
};
