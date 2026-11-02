import { fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { TermsScreen } from '../src/features/legal/TermsScreen';
import { PRIVACY_POLICY } from '../src/features/legal/privacyPolicy';

describe('Terms and Conditions screen', () => {
  afterEach(() => jest.restoreAllMocks());

  it('renders all 14 sections of the policy from Figma', async () => {
    await render(<TermsScreen onBack={jest.fn()} />);
    expect(screen.getByText('Xspeeria — Privacy Policy')).toBeTruthy();
    expect(PRIVACY_POLICY.sections).toHaveLength(14);
    PRIVACY_POLICY.sections.forEach((s, i) => {
      expect(s.title.startsWith(`${i + 1}. `)).toBe(true);
      expect(screen.getByText(s.title)).toBeTruthy();
    });
  });

  it('keeps the wording verbatim (spot checks)', () => {
    const text = JSON.stringify(PRIVACY_POLICY);
    expect(text).toContain('We do not sell your data.');
    expect(text).toContain('Xspeeria is not intended for individuals under 18.');
    expect(text).not.toMatch(/1\. 2\. 3\./);
  });

  it('opens the contact email in the mail app', async () => {
    const open = jest.spyOn(Linking, 'openURL').mockResolvedValue(undefined);
    await render(<TermsScreen onBack={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('terms-email'));
    expect(open).toHaveBeenCalledWith('mailto:Xspeeria@intelyticslimited.com');
  });
});
