/** ADR-105: Germany (+49), France (+33) and China (+86) phone numbers. */
import { fullPhone, splitPhone } from '../src/features/auth/ui';
import { normalisePhone } from '../src/features/profile/verification';

describe('new corridor phone numbers', () => {
  it('builds and checks each country’s number (the trunk 0 is dropped)', () => {
    expect(normalisePhone(fullPhone('DE', '01512 3456789'))).toBe('+4915123456789');
    expect(normalisePhone(fullPhone('FR', '06 12 34 56 78'))).toBe('+33612345678');
    expect(normalisePhone(fullPhone('CN', '138 0013 8000'))).toBe('+8613800138000');
  });

  it('refuses numbers of the wrong length', () => {
    expect(normalisePhone('+3361234567')).toBeNull(); // France: 8 digits
    expect(normalisePhone('+861380013800')).toBeNull(); // China: 10 digits
    expect(normalisePhone('+8623800138000')).toBeNull(); // China mobile starts with 1
  });

  it('reads a saved number back into its country', () => {
    expect(splitPhone('+4915123456789')).toEqual({ country: 'DE', local: '15123456789' });
    expect(splitPhone('+33612345678')).toEqual({ country: 'FR', local: '612345678' });
    expect(splitPhone('+8613800138000')).toEqual({ country: 'CN', local: '13800138000' });
  });
});
