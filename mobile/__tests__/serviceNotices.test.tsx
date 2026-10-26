/** ADR-066: outage notices staff report show on Home while they last; they block nothing. */

import { render, screen } from '@testing-library/react-native';

import { noticesApi, type ServiceNotice } from '../src/api/noticesApi';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { ACTIVITY_ITEMS, READINESS_INCOMPLETE } from '../src/fixtures';

const HIGH: ServiceNotice = {
  id: 'n1',
  service: 'GBP payouts',
  message: 'Payouts to UK banks are delayed. Your money is safe in escrow.',
  severity: 'high',
  started_at: '2026-10-26T09:00:00Z',
  expected_end_at: '2026-10-26T13:00:00Z',
};

describe('service notices on Home', () => {
  it('shows each notice with the service, the message and when it should be back', async () => {
    await render(
      <HomeScreen
        dimensions={READINESS_INCOMPLETE}
        activity={ACTIVITY_ITEMS}
        onCreateOffer={() => undefined}
        notices={[HIGH, { ...HIGH, id: 'n2', service: 'Sign-in', message: 'Codes are slow to arrive.', severity: 'low', expected_end_at: null }]}
      />,
    );
    expect(screen.getByTestId('service-notices')).toBeTruthy();
    expect(screen.getByText('GBP payouts')).toBeTruthy();
    expect(screen.getByText(/Payouts to UK banks are delayed/)).toBeTruthy();
    expect(screen.getByTestId('service-notice-end-n1')).toBeTruthy();
    expect(screen.queryByTestId('service-notice-end-n2')).toBeNull();
    // Nothing is blocked: the main action is still there.
    expect(screen.queryByTestId('home-screen')).toBeTruthy();
  });

  it('shows nothing when there is no outage', async () => {
    await render(<HomeScreen dimensions={READINESS_INCOMPLETE} activity={ACTIVITY_ITEMS} />);
    expect(screen.queryByTestId('service-notices')).toBeNull();
  });

  it('asks the server with the signed-in token', async () => {
    const fetchImpl = jest.fn(async () => new Response(JSON.stringify([HIGH]), { status: 200 })) as unknown as typeof fetch;
    const got = await noticesApi.list('tok', { fetchImpl, baseUrl: 'https://api.test' });
    expect(got[0].service).toBe('GBP payouts');
    const [url, init] = (fetchImpl as unknown as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.test/api/v1/service-notices');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer tok' });
  });
});
