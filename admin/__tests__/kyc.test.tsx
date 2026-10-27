/** Identity-check review (ADR-069): the lists, two-person approval as shown, Didit read-only. */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactElement } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { KycCaseScreen, why } from '../components/screens/KycCaseScreen';
import { KycScreen } from '../components/screens/KycScreen';
import { makeAdminApi, type AdminApi, type KycCaseDetail, type Me } from '../lib/api';
import { SessionProvider } from '../lib/session';

function me(id: string, permissions: string[]): Me {
  return {
    id, email: `${id}@xspeeria.test`, name: 'Staff', role_id: 'r', role: 'compliance_officer', status: 'active', phone: null,
    has_photo: false, password_set: true, last_login_at: null, created_at: '2026-10-01T00:00:00Z', permissions,
  };
}
const FULL = ['kyc.read', 'kyc.update', 'kyc.approve'];

const HELD: KycCaseDetail = {
  id: '44444444-2222-3333-4444-555555555555', ref: 'KYC-44444444', status: 'under_review', review_reason: 'DUPLICATE_IDENTITY',
  in_didit: false, country: 'NG', country_name: 'Nigeria', provider_status: 'Approved',
  identity: { legal_name: 'Ada Obi', date_of_birth: '1990-05-17', id_type: 'passport', issuing_country: 'NGA' },
  can_approve: true,
  customer: { user_id: 'u-1', email: 'ada@example.com', phone: '+2348031111111', account_status: 'active' },
  same_document_elsewhere: [], account_identity: [], decision_reason: null, decided_at: null,
  created_at: '2026-10-26T10:00:00Z', updated_at: '2026-10-26T10:00:00Z', reviews: [],
};
const PENDING = {
  ...HELD,
  reviews: [{ id: 'r1', status: 'pending' as const, reason: 'Same person, checked by phone', recommended_by: 'The Boss', recommended_by_id: 's-1', recommended_at: '2026-10-26T11:00:00Z', decided_by: null, decided_at: null, decision_note: null }],
};

function mount(who: Me, ui: ReactElement, over: Partial<AdminApi> = {}): AdminApi {
  const api: AdminApi = {
    ...makeAdminApi(vi.fn()),
    me: vi.fn(async () => who),
    listKycCases: vi.fn(async () => ({
      total: 1, held: 1, in_didit: 2,
      items: [{ id: HELD.id, ref: HELD.ref, customer: 'Ada Obi', customer_email: 'ada@example.com', country: 'NG' as const, status: 'under_review' as const, review_reason: 'DUPLICATE_IDENTITY' as const, awaiting_second: false, waiting_since: '2026-10-26T10:00:00Z', decided_at: null }],
    })),
    kycCase: vi.fn(async () => HELD),
    recommendKyc: vi.fn(async () => undefined),
    confirmKyc: vi.fn(async () => undefined),
    declineKyc: vi.fn(async () => undefined),
    rejectKyc: vi.fn(async () => undefined),
    ...over,
  };
  render(<SessionProvider api={api} onSignedOut={() => undefined}>{ui}</SessionProvider>);
  return api;
}

describe('lists', () => {
  it('shows held checks, the Didit count, and switches lists', async () => {
    const api = mount(me('s-2', FULL), <KycScreen />);
    await screen.findByText('KYC-44444444');
    expect(screen.getByText('Same person on another account')).toBeInTheDocument();
    expect(screen.getByTestId('kyc-didit')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('queue-in_didit'));
    await waitFor(() => expect(api.listKycCases).toHaveBeenLastCalledWith(expect.objectContaining({ queue: 'in_didit' })));
  });
});

describe('one check', () => {
  it('first person recommends with a reason', async () => {
    const api = mount(me('s-1', FULL), <KycCaseScreen id={HELD.id} />);
    fireEvent.click(await screen.findByTestId('kyc-recommend'));
    fireEvent.change(screen.getByTestId('reason'), { target: { value: 'Same person, checked by phone' } });
    fireEvent.click(screen.getByTestId('reason-confirm'));
    await waitFor(() => expect(api.recommendKyc).toHaveBeenCalledWith(HELD.id, 'Same person, checked by phone'));
  });

  it('the recommender sees no Confirm or Reject; a second person does', async () => {
    mount(me('s-1', FULL), <KycCaseScreen id={HELD.id} />, { kycCase: vi.fn(async () => PENDING) });
    expect(await screen.findByTestId('own-recommendation')).toBeInTheDocument();
    expect(screen.queryByTestId('kyc-confirm')).toBeNull();
    expect(screen.queryByTestId('kyc-reject')).toBeNull();
  });

  it('a second person confirms', async () => {
    const api = mount(me('s-2', FULL), <KycCaseScreen id={HELD.id} />, { kycCase: vi.fn(async () => PENDING) });
    fireEvent.click(await screen.findByTestId('kyc-confirm'));
    await waitFor(() => expect(api.confirmKyc).toHaveBeenCalledWith(HELD.id));
  });

  it('Didit reviews are read-only, with no buttons', async () => {
    const inDidit = { ...HELD, review_reason: null, in_didit: true, can_approve: false };
    mount(me('s-2', FULL), <KycCaseScreen id={HELD.id} />, { kycCase: vi.fn(async () => inDidit) });
    expect(await screen.findByTestId('why')).toHaveTextContent('Decide it in Didit’s console');
    expect(screen.queryByTestId('kyc-recommend')).toBeNull();
    expect(screen.queryByTestId('kyc-reject')).toBeNull();
    expect(why(inDidit)).toContain('Didit');
  });

  it('missing facts: no Recommend, only Reject', async () => {
    const missing = { ...HELD, review_reason: 'CHECKS_INCOMPLETE' as const, can_approve: false, identity: { ...HELD.identity, date_of_birth: null } };
    mount(me('s-2', FULL), <KycCaseScreen id={HELD.id} />, { kycCase: vi.fn(async () => missing) });
    expect(await screen.findByTestId('kyc-reject')).toBeInTheDocument();
    expect(screen.queryByTestId('kyc-recommend')).toBeNull();
  });
});
