import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Alert } from 'react-native';

import { NewLocationScreen, VerifyRegionScreen, formatSsn, isPlausibleSsn } from '../src/features/auth/RegionScreens';
import { session } from '../src/features/auth/session';
import { kycRegions } from '../src/features/profile/kycRegions';

beforeEach(() => {
  session.reset();
  kycRegions.reset();
  jest.restoreAllMocks();
});

describe('SSN format', () => {
  it('formats as typed and applies SSA structure rules', () => {
    expect(formatSsn('123456789')).toBe('123-45-6789');
    expect(formatSsn('12-34')).toBe('123-4');
    expect(isPlausibleSsn('123-45-6789')).toBe(true);
    for (const bad of ['000-12-3456', '666-12-3456', '912-12-3456', '123-00-4567', '123-45-0000', '12-345-6789']) {
      expect(isPlausibleSsn(bad)).toBe(false);
    }
  });
});

describe('region store and demo trigger', () => {
  it('a submitted region is pending and added once', () => {
    kycRegions.submit({ flag: 'USD', name: 'United States' });
    kycRegions.submit({ flag: 'USD', name: 'United States' });
    expect(kycRegions.get().filter((r) => r.flag === 'USD')).toEqual([{ flag: 'USD', name: 'United States', state: 'pending' }]);
  });

  it('the demo can flag the next log-in as from the US', () => {
    session.simulateRegion('US');
    expect(session.get().newRegion).toBe('US');
    session.clearNewRegion();
    expect(session.get().newRegion).toBeNull();
  });
});

describe('New location screen (Figma 436:12247)', () => {
  it('shows the Figma copy and both actions', async () => {
    const onConfirm = jest.fn();
    const onSkip = jest.fn();
    await render(<NewLocationScreen onConfirm={onConfirm} onSkip={onSkip} />);
    expect(screen.getByText('Trade in Your New Location')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('new-location-confirm'));
    await fireEvent.press(screen.getByTestId('new-location-skip'));
    expect(onConfirm).toHaveBeenCalled();
    expect(onSkip).toHaveBeenCalled();
  });
});

describe('US identity check', () => {
  it('needs SSN, an ID photo and a selfie; SSN is masked and never passed on', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSubmit = jest.fn();
    const pick = jest.fn(async () => ({ kind: 'picked' as const, uri: 'file:///id.jpg' }));
    await render(<VerifyRegionScreen onDone={jest.fn()} onCancel={jest.fn()} onSubmit={onSubmit} pick={pick} />);
    expect(screen.getByTestId('verify-region-ssn').props.secureTextEntry).toBe(true);
    expect(screen.getByTestId('verify-region-submit').props.accessibilityState.disabled).toBe(true);

    await fireEvent.changeText(screen.getByTestId('verify-region-ssn'), '123456789');
    await fireEvent.press(screen.getByTestId('verify-region-id'));
    expect(screen.getByTestId('document-picker')).toBeTruthy();
    for (const l of ['State ID Card', 'Passport', 'Driver’s License']) expect(screen.getByText(l)).toBeTruthy();
    await act(async () => fireEvent.press(screen.getByTestId('document-passport')));
    expect(screen.getByText('Passport added')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('verify-region-selfie'));
    const buttons = alert.mock.calls[0][2] as { text: string; onPress?: () => void }[];
    await act(async () => buttons.find((b) => b.text === 'Continue as matched')?.onPress?.());

    await fireEvent.press(screen.getByTestId('verify-region-submit'));
    expect(onSubmit).toHaveBeenCalledWith({ document: 'passport' });
    expect(JSON.stringify(onSubmit.mock.calls)).not.toContain('6789');
    expect(screen.getByTestId('verify-region-done')).toBeTruthy();
  });

  it('refuses an impossible SSN', async () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSubmit = jest.fn();
    await render(<VerifyRegionScreen onDone={jest.fn()} onCancel={jest.fn()} onSubmit={onSubmit} pick={async () => ({ kind: 'picked', uri: 'x' })} />);
    await fireEvent.changeText(screen.getByTestId('verify-region-ssn'), '000123456');
    await fireEvent.press(screen.getByTestId('verify-region-id'));
    await act(async () => fireEvent.press(screen.getByTestId('document-state-id')));
    await fireEvent.press(screen.getByTestId('verify-region-selfie'));
    await act(async () => (alert.mock.calls[0][2] as { text: string; onPress?: () => void }[])[1].onPress?.());
    await fireEvent.press(screen.getByTestId('verify-region-submit'));
    expect(screen.getByTestId('verify-region-ssn-error')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
