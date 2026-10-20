/** ADR-042 in the app: per-country identity checks and the new-location prompt (server builds). */
import { act, render, screen } from '@testing-library/react-native';

import { ApiError, apiRequest } from '../src/api/client';
import { NewLocationScreen } from '../src/features/auth/RegionScreens';
import { IdentityCheckScreen } from '../src/features/kyc/IdentityCheckScreen';
import { regionPrompt } from '../src/features/kyc/regionPrompt';
import type { KycSource } from '../src/features/kyc/serverKyc';
import { regionsFromServer } from '../src/features/kyc/regions';

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'x',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

describe('new-location prompt', () => {
  beforeEach(() => regionPrompt.reset());

  it('offers a suggested country once per sign-in, and never after Skip', () => {
    const r = { regions: [], suggested_country: 'GB' as const };
    expect(regionPrompt.next(r)).toBe('GB');
    expect(regionPrompt.next(r)).toBeNull();
    regionPrompt.reset();
    regionPrompt.skip('US');
    expect(regionPrompt.next({ regions: [], suggested_country: 'US' })).toBeNull();
    expect(regionPrompt.next({ regions: [], suggested_country: null })).toBeNull();
  });

  it('names the detected country and its currency, without the demo note', async () => {
    await render(
      <NewLocationScreen
        onConfirm={jest.fn()}
        onSkip={jest.fn()}
        place={{ flag: 'GBP', name: 'United Kingdom', currency: 'GBP', detected: true }}
      />,
    );
    expect(screen.getByText(/United Kingdom/)).toBeTruthy();
    expect(screen.getByText(/trade in GBP/)).toBeTruthy();
    expect(screen.queryByText(/location is simulated/)).toBeNull();
  });
});

describe('approved regions from the server', () => {
  it('lists approved and in-progress countries only', () => {
    expect(
      regionsFromServer({
        regions: [
          { country: 'NG', status: 'approved' },
          { country: 'GB', status: 'under_review' },
          { country: 'US', status: 'rejected' },
        ],
        suggested_country: null,
      }),
    ).toEqual([
      { flag: 'NGN', name: 'Nigeria', state: 'approved' },
      { flag: 'GBP', name: 'United Kingdom', state: 'pending' },
    ]);
  });
});

describe('identity check for another country', () => {
  it('asks for an ID issued by that country', async () => {
    const src: KycSource = {
      current: jest.fn(async () => ({
        kyc_case_id: null,
        status: 'not_started' as const,
        message: 'Verify your identity to trade.',
        verification_url: null,
        legal_name: null,
      })),
      start: jest.fn(async () => {
        throw new ApiError('KYC_409_CASE_ALREADY_ACTIVE', 409, 'Finish your other identity check first.');
      }),
      open: jest.fn(async () => undefined),
    };
    await render(<IdentityCheckScreen country="US" source={src} onBack={jest.fn()} pollMs={60_000} />);
    await flush();
    expect(screen.getAllByText(/issued by the United States/).length).toBeGreaterThan(0);
  });
});

describe('server refusals carry the country', () => {
  it('keeps details from the error body', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          error: { code: 'AUTH_403_KYC_REQUIRED', message: 'Verify your identity for the United Kingdom.', details: { country: 'GB' } },
        }),
        { status: 403, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch;
    await expect(apiRequest('POST', '/x', { fetchImpl, baseUrl: 'https://x.test' })).rejects.toMatchObject({
      code: 'AUTH_403_KYC_REQUIRED',
      details: { country: 'GB' },
    });
  });
});
