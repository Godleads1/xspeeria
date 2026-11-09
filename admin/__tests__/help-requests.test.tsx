/** ADR-103: staff read, reply to and close "Need help?" requests. */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HelpRequestsScreen } from '../components/screens/HelpRequestsScreen';
import { makeAdminApi, type AdminApi, type HelpRequestDetail, type HelpRequestRow, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(permissions: string[]): Me {
  return {
    id: 's-1', email: 'x@xspeeria.test', name: 'Ada Agent', role_id: 'r', role: 'support_agent', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}

const ROW: HelpRequestRow = {
  request_id: 'aaaaaaaa-1111-2222-3333-444444444444', phone: '+2348038383838', email: 'ada@example.com', status: 'open',
  created_at: '2026-11-09T10:00:00Z', last_message_at: '2026-11-09T10:00:00Z', messages: 1,
  matched_user_id: 'u-1', email_matches_account: false,
};
const DETAIL: HelpRequestDetail = {
  ...ROW,
  thread: [{ message_id: 'm1', author: 'customer', staff_id: null, body: 'Face check fails on my new phone', created_at: '2026-11-09T10:00:00Z' }],
};

function mount(permissions: string[], over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => me(permissions)),
    helpRequests: vi.fn(async () => [ROW]),
    helpRequest: vi.fn(async () => DETAIL),
    replyHelp: vi.fn(async () => undefined),
    closeHelp: vi.fn(async () => undefined),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}><HelpRequestsScreen /></SessionProvider>);
  return api;
}

describe('Help requests (ADR-103)', () => {
  it('lists open requests, opens one, shows the account match, replies and closes', async () => {
    const api = mount(['disputes.read', 'disputes.update']);
    fireEvent.click(await screen.findByTestId(`help-row-${ROW.request_id}`));
    expect(api.helpRequests).toHaveBeenCalledWith('open');
    expect(await screen.findByText('Face check fails on my new phone')).toBeInTheDocument();
    expect(screen.getByTestId('help-match')).toHaveTextContent('The phone matches an account, but the email does not.');
    fireEvent.change(screen.getByTestId('help-reply'), { target: { value: '  Please try the identity check  ' } });
    fireEvent.click(screen.getByTestId('help-send'));
    await waitFor(() => expect(api.replyHelp).toHaveBeenCalledWith(ROW.request_id, 'Please try the identity check'));
    fireEvent.click(await screen.findByTestId('help-close'));
    await waitFor(() => expect(api.closeHelp).toHaveBeenCalledWith(ROW.request_id));
  });

  it('read-only staff see the thread but no reply or close', async () => {
    mount(['disputes.read']);
    fireEvent.click(await screen.findByTestId(`help-row-${ROW.request_id}`));
    expect(await screen.findByText('Face check fails on my new phone')).toBeInTheDocument();
    expect(screen.queryByTestId('help-reply')).toBeNull();
    expect(screen.queryByTestId('help-close')).toBeNull();
  });

  it('a closed request has no reply box; the filter asks the server again', async () => {
    const api = mount(['disputes.read', 'disputes.update'], { helpRequest: vi.fn(async () => ({ ...DETAIL, status: 'closed' as const })) });
    fireEvent.click(await screen.findByTestId(`help-row-${ROW.request_id}`));
    expect(await screen.findByTestId('help-closed')).toBeInTheDocument();
    expect(screen.queryByTestId('help-reply')).toBeNull();
    fireEvent.change(screen.getByTestId('help-filter'), { target: { value: 'closed' } });
    await waitFor(() => expect(api.helpRequests).toHaveBeenCalledWith('closed'));
  });
});
