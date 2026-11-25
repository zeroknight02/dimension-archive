/* ==========================================================
   次元簿 · 安全模块（账号库加密）
   说明书 3.4 / 5.8.2
   PBKDF2 派生 + AES-GCM 加密 + 随机盐 + 随机 IV。
   主密码不以任何形式落盘：只存盐、迭代次数与一段校验密文。
   会话密钥只存在于内存，锁定或超时即丢弃。
   ========================================================== */

const ITERATIONS = 310000;
const VERIFIER_TEXT = 'dimension-archive-vault-v1';

let sessionKey = null;
let sessionAt = 0;
let autoLockMinutes = 10;

export function isUnlocked() {
  return !!sessionKey;
}


export function setAutoLock(minutes) {
  autoLockMinutes = Math.max(0, Number(minutes) || 0);
}


export function touch() {
  sessionAt = Date.now();
}

/* 超时检查：任何渲染前调用，过期立即上锁 */
export function checkTimeout() {
  if (!sessionKey || !autoLockMinutes) return false;
  if (Date.now() - sessionAt > autoLockMinutes * 60000) {
    lock();
    return true;
  }
  return false;
}

export function lock() {
  sessionKey = null;
  sessionAt = 0;
}

/* ---------------- 编解码 ---------------- */

function bufToB64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function b64ToBuf(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const base = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

export function cryptoAvailable() {
  return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.deriveKey);
}

/* ---------------- 保险库 ---------------- */

export async function createVault(password, saltB64) {
  if (!cryptoAvailable()) return { ok: false, error: '当前环境不支持 Web Crypto，无法加密保存密码' };
  const salt = saltB64 ? b64ToBuf(saltB64) : randomBytes(16);
  const key = await deriveKey(password, salt, ITERATIONS);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(VERIFIER_TEXT));
  sessionKey = key;
  sessionAt = Date.now();
  return {
    ok: true,
    vault: {
      k: 'vault',
      salt: bufToB64(salt),
      iterations: ITERATIONS,
      iv: bufToB64(iv),
      verifier: bufToB64(ct),
      createdAt: new Date().toISOString()
    }
  };
}

export async function unlockVault(vault, password) {
  if (!cryptoAvailable()) return { ok: false, error: '当前环境不支持 Web Crypto' };
  if (!vault || !vault.salt) return { ok: false, error: '还没有设置主密码' };
  try {
    const salt = b64ToBuf(vault.salt);
    const key = await deriveKey(password, salt, vault.iterations || ITERATIONS);
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(vault.iv) },
      key,
      b64ToBuf(vault.verifier)
    );
    if (new TextDecoder().decode(plain) !== VERIFIER_TEXT) return { ok: false, error: '主密码不正确' };
    sessionKey = key;
    sessionAt = Date.now();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: '主密码不正确' };
  }
}

export async function encryptSecret(plain) {
  if (!sessionKey) return null;
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, sessionKey, new TextEncoder().encode(String(plain || '')));
  touch();
  return { iv: bufToB64(iv), ct: bufToB64(ct), at: Date.now() };
}

export async function decryptSecret(secret) {
  if (!sessionKey || !secret || !secret.ct) return '';
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: b64ToBuf(secret.iv) },
      sessionKey,
      b64ToBuf(secret.ct)
    );
    touch();
    return new TextDecoder().decode(plain);
  } catch (e) {
    return '';
  }
}

/* 剪贴板：复制后提示清除（说明书 5.8.2） */
export async function copySecret(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      return true;
    } catch (e2) {
      return false;
    }
  }
}

/* 导出时使用：脱离会话密钥，用临时口令加密整包 */
export async function encryptWithPassword(password, text) {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, ITERATIONS);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(text));
  return {
    algo: 'AES-GCM',
    kdf: 'PBKDF2-SHA256',
    iterations: ITERATIONS,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    payload: bufToB64(ct)
  };
}

export async function decryptWithPassword(password, pack) {
  const key = await deriveKey(password, b64ToBuf(pack.salt), pack.iterations || ITERATIONS);
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64ToBuf(pack.iv) },
    key,
    b64ToBuf(pack.payload)
  );
  return new TextDecoder().decode(plain);
}
