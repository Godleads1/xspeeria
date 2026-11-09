import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ChangeContactScreen } from '../src/features/profile/ChangeContactScreen';
import { ChangeDobScreen, formatDobInput } from '../src/features/profile/ChangeDobScreen';
import { EditProfileScreen } from '../src/features/profile/EditProfileScreen';
import { profileStore } from '../src/features/profile/profileStore';
import {
  CODE_TTL_MS,
  MAX_CODE_TRIES,
  RESEND_AFTER_MS,
  ageOn,
  canResend,
  checkCode,
  dobError,
  makeCode,
  maskContact,
  normaliseEmail,
  normalisePhone,
  parseDob,
  sendChallenge,
} from '../src/features/profile/verification';

const T0 = 1_760_000_000_000;
let seed = 3;
const rnd = (n: number): Uint8Array => Uint8Array.from({ length: n }, () => (seed = (seed * 73 + 41) % 256));
const allow = async (): Promise<boolean> => true;

beforeEach(() => {
  seed = 3;
  profileStore.reset();
});

describe('contact rules', () => {
  it('validates phone numbers with country code, incl. NG and UK lengths', () => {
    expect(normalisePhone('+234 803 838 3838')).toBe('+2348038383838');
    expect(normalisePhone('+44 7700 900123')).toBe('+447700900123');
    expect(normalisePhone('+234701399012')).toBeNull(); // 9 digits after +234
    expect(normalisePhone('08038383838')).toBeNull(); // no country code
    expect(normalisePhone('+1 (415) 555-0100')).toBe('+14155550100');
    expect(normalisePhone('+1 415 555 010')).toBeNull(); // +1 needs 10 digits
    expect(normalisePhone('+1 015 555 0100')).toBeNull(); // area codes don't start with 0 or 1
  });

  it('validates and lower-cases email', () => {
    expect(normaliseEmail(' David@Example.com ')).toBe('david@example.com');
    expect(normaliseEmail('david@example')).toBeNull();
    expect(normaliseEmail('not an email')).toBeNull();
  });

  it('masks addresses in messages', () => {
    expect(maskContact('phone', '+2348038383838')).toBe('+234 ••• ••• 3838');
    expect(maskContact('email', 'david@example.com')).toBe('d••••@example.com');
  });

  it('makes uniform 6-digit codes', () => {
    for (let i = 0; i < 50; i++) expect(makeCode(rnd)).toMatch(/^\d{6}$/);
  });

  it('expires, limits tries and rate-limits resend', () => {
    const c = sendChallenge('phone', '+2348000000000', T0, () => new Uint8Array([0, 0, 0, 42]));
    expect(c.code).toBe('000042');
    expect(checkCode(c, '000042', T0 + CODE_TTL_MS + 1)).toMatchObject({ ok: false, reason: 'expired' });
    let cur = c;
    for (let i = 1; i <= MAX_CODE_TRIES; i++) {
      const r = checkCode(cur, '999999', T0);
      expect(r.ok).toBe(false);
      if (!r.ok) cur = r.challenge;
    }
    expect(checkCode(cur, '000042', T0)).toMatchObject({ ok: false, reason: 'used-up' });
    expect(canResend(c, T0 + RESEND_AFTER_MS - 1)).toBe(false);
    expect(canResend(c, T0 + RESEND_AFTER_MS)).toBe(true);
  });
});

describe('date of birth rules', () => {
  it('parses real dates only and enforces 18+', () => {
    expect(parseDob('12/07/1997')).toBe('1997-07-12');
    expect(parseDob('31/02/1997')).toBeNull();
    expect(formatDobInput('12071997')).toBe('12/07/1997');
    const now = new Date(2026, 9, 17);
    expect(ageOn('2008-10-18', now)).toBe(17);
    expect(dobError('2008-10-18', now)).toMatch(/18 or older/);
    expect(dobError('2008-10-17', now)).toBeNull();
    expect(dobError(null, now)).toMatch(/DD\/MM\/YYYY/);
  });
});

describe('Edit profile screen', () => {
  it('sets and removes a profile photo and banner', async () => {
    const pick = jest.fn(async (kind: string) => ({ kind: 'picked' as const, uri: `file:///${kind}.jpg` }));
    await render(<EditProfileScreen onBack={jest.fn()} onEdit={jest.fn()} pick={pick} />);
    await fireEvent.press(screen.getByTestId('edit-avatar'));
    await act(async () => fireEvent.press(screen.getByTestId('photo-sheet-choose')));
    expect(profileStore.get().avatarUri).toBe('file:///avatar.jpg');
    await fireEvent.press(screen.getByTestId('edit-banner'));
    await act(async () => fireEvent.press(screen.getByTestId('photo-sheet-choose')));
    expect(profileStore.get().bannerUri).toBe('file:///banner.jpg');
    await fireEvent.press(screen.getByTestId('edit-avatar'));
    await fireEvent.press(screen.getByTestId('photo-sheet-remove'));
    expect(profileStore.get().avatarUri).toBeNull();
  });

  it('name is locked; phone, email and date of birth open their flows', async () => {
    const onEdit = jest.fn();
    await render(<EditProfileScreen onBack={jest.fn()} onEdit={onEdit} pick={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('edit-name'));
    expect(onEdit).not.toHaveBeenCalled();
    expect(screen.getByText(/Contact Support to change your legal name/)).toBeTruthy();
    await fireEvent.press(screen.getByTestId('edit-phone'));
    await fireEvent.press(screen.getByTestId('edit-email'));
    await fireEvent.press(screen.getByTestId('edit-dob'));
    expect(onEdit.mock.calls).toEqual([['phone'], ['email'], ['dob']]);
  });
});

describe('Change phone / email', () => {
  it('needs 2FA, then the code sent to the NEW number, before changing', async () => {
    const stepUp = jest.fn(allow);
    await render(<ChangeContactScreen kind="phone" onBack={jest.fn()} onDone={jest.fn()} stepUp={stepUp} random={rnd} now={() => T0} showDevCode />);
    await fireEvent.changeText(screen.getByTestId('change-contact-value'), '+234 803 111 2222');
    await act(async () => fireEvent.press(screen.getByTestId('change-contact-send')));
    expect(stepUp).toHaveBeenCalledWith(expect.stringMatching(/\+234 ••• ••• 2222/));
    expect(profileStore.get().phone).toBe('+234 803 838 3838');
    const code = String([screen.getByTestId('change-contact-devcode').props.children].flat().join('')).match(/(\d{6})/)?.[1] as string;

    await fireEvent.changeText(screen.getByTestId('change-contact-code'), code === '000000' ? '111111' : '000000');
    await fireEvent.press(screen.getByTestId('change-contact-verify'));
    expect(screen.getByTestId('change-contact-error')).toBeTruthy();
    expect(profileStore.get().phone).toBe('+234 803 838 3838');

    await fireEvent.changeText(screen.getByTestId('change-contact-code'), code);
    await fireEvent.press(screen.getByTestId('change-contact-verify'));
    expect(profileStore.get().phone).toBe('+2348031112222');
    expect(screen.getByTestId('change-contact-done')).toBeTruthy();
  });

  it('nothing changes if the 2FA check fails', async () => {
    await render(<ChangeContactScreen kind="email" onBack={jest.fn()} onDone={jest.fn()} stepUp={async () => false} random={rnd} now={() => T0} />);
    await fireEvent.changeText(screen.getByTestId('change-contact-value'), 'new@example.com');
    await act(async () => fireEvent.press(screen.getByTestId('change-contact-send')));
    expect(screen.queryByTestId('change-contact-code')).toBeNull();
    expect(profileStore.get().email).toBe('davidpeters@example.com');
  });

  it('rejects invalid or unchanged values before asking for 2FA', async () => {
    const stepUp = jest.fn(allow);
    await render(<ChangeContactScreen kind="email" onBack={jest.fn()} onDone={jest.fn()} stepUp={stepUp} random={rnd} now={() => T0} />);
    await fireEvent.changeText(screen.getByTestId('change-contact-value'), 'nope');
    await act(async () => fireEvent.press(screen.getByTestId('change-contact-send')));
    expect(screen.getByTestId('change-contact-error')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('change-contact-value'), 'DavidPeters@example.com');
    await act(async () => fireEvent.press(screen.getByTestId('change-contact-send')));
    expect(screen.getByText('This is already your email address')).toBeTruthy();
    expect(stepUp).not.toHaveBeenCalled();
  });

  it('hides the test code unless asked (no code on screen in release builds)', async () => {
    await render(<ChangeContactScreen kind="email" onBack={jest.fn()} onDone={jest.fn()} stepUp={allow} random={rnd} now={() => T0} showDevCode={false} />);
    await fireEvent.changeText(screen.getByTestId('change-contact-value'), 'new@example.com');
    await act(async () => fireEvent.press(screen.getByTestId('change-contact-send')));
    expect(screen.getByTestId('change-contact-sent')).toBeTruthy();
    expect(screen.queryByTestId('change-contact-devcode')).toBeNull();
  });
});

describe('Change date of birth', () => {
  const now = (): Date => new Date(2026, 9, 17);

  it('needs an ID document and stays pending until reviewed', async () => {
    const pick = jest.fn(async () => ({ kind: 'picked' as const, uri: 'file:///id.jpg' }));
    await render(<ChangeDobScreen onBack={jest.fn()} onDone={jest.fn()} pick={pick} now={now} />);
    await fireEvent.changeText(screen.getByTestId('change-dob-value'), '01021990');
    expect(screen.getByTestId('change-dob-value').props.value).toBe('01/02/1990');
    await fireEvent.press(screen.getByTestId('change-dob-submit'));
    expect(screen.getByText('Add a photo of your ID document')).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('change-dob-attach')));
    await fireEvent.press(screen.getByTestId('change-dob-submit'));
    expect(screen.getByTestId('change-dob-done')).toBeTruthy();
    expect(profileStore.get().dateOfBirth).toBe('1997-07-12');
    expect(profileStore.get().pendingDob?.dateOfBirth).toBe('1990-02-01');
  });

  it('refuses under-18 dates', async () => {
    await render(<ChangeDobScreen onBack={jest.fn()} onDone={jest.fn()} pick={jest.fn()} now={now} />);
    await fireEvent.changeText(screen.getByTestId('change-dob-value'), '01012010');
    await fireEvent.press(screen.getByTestId('change-dob-submit'));
    expect(screen.getByText('You must be 18 or older to use Xspeeria')).toBeTruthy();
    expect(profileStore.get().pendingDob).toBeNull();
  });
});
