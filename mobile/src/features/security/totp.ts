/**
 * RFC 6238 TOTP (HMAC-SHA1, RFC 4226 truncation) and RFC 4648 Base32, in plain TypeScript.
 *
 * MOCK-ONLY VERIFIER (ADR-008 §3): used on the device solely because there is no backend
 * yet. In production the secret lives only on the server and verification happens there.
 */

/* ---------------------------------------------------------------- SHA-1 */

function rotl(x: number, n: number): number {
  return (x << n) | (x >>> (32 - n));
}

export function sha1(data: Uint8Array): Uint8Array {
  const ml = data.length;
  const withPad = ((ml + 8) >> 6) * 64 + 64;
  const buf = new Uint8Array(withPad);
  buf.set(data);
  buf[ml] = 0x80;
  const view = new DataView(buf.buffer);
  const bits = ml * 8;
  view.setUint32(withPad - 8, Math.floor(bits / 2 ** 32));
  view.setUint32(withPad - 4, bits >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let off = 0; off < withPad; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number;
      let k: number;
      if (i < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (i < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d;
      d = c;
      c = rotl(b, 30) >>> 0;
      b = a;
      a = t;
    }
    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }
  const out = new Uint8Array(20);
  const ov = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => ov.setUint32(i * 4, h));
  return out;
}

export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const block = 64;
  let k = key.length > block ? sha1(key) : key;
  const padded = new Uint8Array(block);
  padded.set(k);
  k = padded;
  const ipad = new Uint8Array(block + message.length);
  const opad = new Uint8Array(block + 20);
  for (let i = 0; i < block; i++) {
    ipad[i] = k[i] ^ 0x36;
    opad[i] = k[i] ^ 0x5c;
  }
  ipad.set(message, block);
  opad.set(sha1(ipad), block);
  return sha1(opad);
}

/* --------------------------------------------------------------- Base32 */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error('Invalid Base32 character');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* ----------------------------------------------------------------- TOTP */

export const TOTP_DIGITS = 6;
export const TOTP_PERIOD_S = 30;

export function hotp(key: Uint8Array, counter: number, digits = TOTP_DIGITS): string {
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const h = hmacSha1(key, msg);
  const off = h[19] & 0xf;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
}

export function totp(key: Uint8Array, nowMs: number, digits = TOTP_DIGITS, periodS = TOTP_PERIOD_S): string {
  return hotp(key, Math.floor(nowMs / 1000 / periodS), digits);
}

/** Constant-time string comparison (equal-length inputs). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Returns the time step the code belongs to (current step or ±1 for clock drift, ADR-008),
 * or null. All three steps are always compared, so timing does not reveal which matched.
 * Callers that accept a code must refuse any step at or before the last one accepted
 * (RFC 6238 §5.2: one use per code).
 */
export function matchTotpStep(key: Uint8Array, code: string, nowMs: number): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(nowMs / 1000 / TOTP_PERIOD_S);
  let matched: number | null = null;
  for (const s of [step - 1, step, step + 1]) {
    if (safeEqual(hotp(key, s), code) && matched === null) matched = s;
  }
  return matched;
}

/** Accepts the current step and ±1 step for clock drift. Does not prevent reuse: see matchTotpStep. */
export function verifyTotp(key: Uint8Array, code: string, nowMs: number): boolean {
  return matchTotpStep(key, code, nowMs) !== null;
}

export function otpauthUri(secretB32: string, account: string, issuer = 'Xspeeria'): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = `secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD_S}`;
  return `otpauth://totp/${label}?${params}`;
}
