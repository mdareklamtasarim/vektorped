'use strict';
// Command-line helpers for server setup and maintenance.
//
//   node src/cli.js create-admin   first admin from env: ADMIN_USER, ADMIN_NAME, ADMIN_PASSWORD, COMPANY
//                                  (does nothing if any user already exists)
//   node src/cli.js backup <file>  consistent copy of the database, safe while the server runs
//
// The database file comes from DB_FILE (default: data/muhasebe.db).
const path = require('node:path');
const fs = require('node:fs');
const { openDb } = require('./db');
const { hashPassword } = require('./auth');

const dbFile = process.env.DB_FILE || path.join(__dirname, '..', 'data', 'muhasebe.db');

function fail(msg) {
  console.error(`Hata: ${msg}`);
  process.exit(1);
}

function createAdmin() {
  const username = (process.env.ADMIN_USER || '').trim();
  const name = (process.env.ADMIN_NAME || '').trim() || username;
  const password = process.env.ADMIN_PASSWORD || '';
  const company = (process.env.COMPANY || '').trim();
  if (!/^[a-zA-Z0-9._-]{1,40}$/.test(username)) fail('ADMIN_USER yalnızca harf, rakam, nokta, tire ve alt çizgi içerebilir.');
  if (password.length < 8) fail('ADMIN_PASSWORD en az 8 karakter olmalı.');
  const db = openDb(dbFile);
  try {
    const created = db.tx(() => {
      if (db.get('SELECT COUNT(*) AS n FROM users').n > 0) return false;
      db.run("INSERT INTO users (username, name, password_hash, role) VALUES (:u, :n, :h, 'admin')", {
        u: username, n: name.slice(0, 80), h: hashPassword(password),
      });
      if (company) db.run("UPDATE settings SET value = :v WHERE key = 'company_name'", { v: company.slice(0, 120) });
      return true;
    });
    console.log(created ? `Yönetici oluşturuldu: ${username}` : 'Zaten kullanıcı var; yönetici oluşturulmadı.');
  } finally {
    db.close();
  }
}

function backup(target) {
  if (!target) fail('Yedek dosyasının yolunu yazın: node src/cli.js backup /yol/yedek.db');
  const out = path.resolve(target);
  if (fs.existsSync(out)) fail(`${out} zaten var.`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const db = openDb(dbFile);
  try {
    db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
    console.log(`Yedek alındı: ${out}`);
  } finally {
    db.close();
  }
}

const [cmd, arg] = process.argv.slice(2);
if (cmd === 'create-admin') createAdmin();
else if (cmd === 'backup') backup(arg);
else fail('Komut: create-admin | backup <dosya>');
