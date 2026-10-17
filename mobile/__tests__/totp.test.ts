import { base32Decode, base32Encode, hmacSha1, otpauthUri, sha1, totp, verifyTotp } from '../src/features/security/totp';

const hex = (b: Uint8Array): string => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
const ascii = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('SHA-1 / HMAC-SHA1', () => {
  it('matches FIPS 180 and RFC 2202 vectors', () => {
    expect(hex(sha1(ascii('abc')))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(hex(sha1(ascii('')))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
    expect(hex(sha1(ascii('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')))).toBe('84983e441c3bd26ebaae4aa1f95129e5e54670f1');
    expect(hex(hmacSha1(ascii('Jefe'), ascii('what do ya want for nothing?')))).toBe('effcdf6ae5eb2fa2d27416d5f184df9c259a7c79');
    expect(hex(hmacSha1(new Uint8Array(80).fill(0xaa), ascii('Test Using Larger Than Block-Size Key - Hash Key First')))).toBe(
      'aa4ae5e15272d00e95705637ce8a3b55ed402112',
    );
  });
});

describe('Base32', () => {
  it('round-trips and matches RFC 4648', () => {
    expect(base32Encode(ascii('foobar'))).toBe('MZXW6YTBOI');
    expect(new TextDecoder().decode(base32Decode('MZXW6YTBOI'))).toBe('foobar');
    expect(() => base32Decode('ABC1')).toThrow();
  });
});

describe('TOTP (RFC 6238 Appendix B, SHA-1, 8 digits)', () => {
  const key = ascii('12345678901234567890');
  it.each([
    [59, '94287082'],
    [1111111109, '07081804'],
    [1111111111, '14050471'],
    [1234567890, '89005924'],
    [2000000000, '69279037'],
    [20000000000, '65353130'],
  ])('T=%i → %s', (t, code) => {
    expect(totp(key, t * 1000, 8)).toBe(code);
  });

  it('verifies 6-digit codes within ±1 step only', () => {
    const now = 1_700_000_000_000;
    const code = totp(key, now);
    expect(verifyTotp(key, code, now)).toBe(true);
    expect(verifyTotp(key, code, now + 30_000)).toBe(true);
    expect(verifyTotp(key, code, now + 90_000)).toBe(false);
    expect(verifyTotp(key, '12345', now)).toBe(false);
    expect(verifyTotp(key, 'abcdef', now)).toBe(false);
  });

  it('builds an otpauth URI', () => {
    expect(otpauthUri('JBSWY3DPEHPK3PXP', 'a@b.com')).toBe(
      'otpauth://totp/Xspeeria%3Aa%40b.com?secret=JBSWY3DPEHPK3PXP&issuer=Xspeeria&algorithm=SHA1&digits=6&period=30',
    );
  });
});
