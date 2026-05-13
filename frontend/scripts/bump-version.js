#!/usr/bin/env node
/**
 * bump-version.js — เปลี่ยน version ของ frontend ทั้ง 5 ที่ในคำสั่งเดียว
 *
 * ใช้: npm run bump-version 3.0.4
 *
 * ไฟล์ที่ถูกอัปเดต:
 *   1. package.json
 *   2. package-lock.json (2 บรรทัด: root + packages.``)
 *   3. src/environments/environment.ts
 *   4. src/environments/environment.prod.ts
 *   5. public/version.json  ← ใช้สำหรับ banner "พบเวอร์ชันใหม่"
 *
 * ไม่ git commit เอง — user สั่ง commit ทีหลัง
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function fail(msg) {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function writeJson(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + '\n');
}

function replaceInFile(p, search, replace) {
  let content = fs.readFileSync(p, 'utf8');
  if (!search.test(content)) {
    fail(`ไม่พบ pattern ใน ${path.relative(ROOT, p)} — ตรวจรูปแบบไฟล์`);
  }
  content = content.replace(search, replace);
  fs.writeFileSync(p, content);
}

const next = process.argv[2];
if (!next) fail('ระบุ version ใหม่: npm run bump-version 3.0.4');
if (!/^\d+\.\d+\.\d+$/.test(next)) fail(`รูปแบบ version ไม่ถูก: ${next} (ต้องเป็น x.y.z)`);

// ── 1. package.json ──
const pkgPath = path.join(ROOT, 'package.json');
const pkg = readJson(pkgPath);
const prev = pkg.version;
if (prev === next) fail(`version ปัจจุบันคือ ${prev} แล้ว — ไม่ต้องเปลี่ยน`);
pkg.version = next;
writeJson(pkgPath, pkg);

// ── 2. package-lock.json (root + packages.``) ──
const lockPath = path.join(ROOT, 'package-lock.json');
const lock = readJson(lockPath);
lock.version = next;
if (lock.packages && lock.packages['']) {
  lock.packages[''].version = next;
}
writeJson(lockPath, lock);

// ── 3-4. environment.ts / environment.prod.ts ──
const envDev = path.join(ROOT, 'src/environments/environment.ts');
const envProd = path.join(ROOT, 'src/environments/environment.prod.ts');
const versionRe = /version:\s*'[^']*'/;
replaceInFile(envDev, versionRe, `version: '${next}'`);
replaceInFile(envProd, versionRe, `version: '${next}'`);

// ── 5. public/version.json ──
const versionJsonPath = path.join(ROOT, 'public/version.json');
writeJson(versionJsonPath, { version: next });

console.log(`✓ bumped ${prev} → ${next}`);
console.log('  - package.json');
console.log('  - package-lock.json');
console.log('  - src/environments/environment.ts');
console.log('  - src/environments/environment.prod.ts');
console.log('  - public/version.json');
console.log('\nอย่าลืม commit + push เพื่อให้ banner ทำงาน:');
console.log(`  git add -A && git commit -m "chore: bump version ${prev} → ${next}" && git push`);
