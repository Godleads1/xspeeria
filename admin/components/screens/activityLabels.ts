/**
 * Plain words for the customer activity log and deal timelines (ADR-073). English keys are
 * translated with tr(); anything unknown falls back to the key with spaces.
 */

import { tr } from '../../lib/i18n';
import type { ActivityCategory } from '../../lib/api';

export const ACTIVITY_LABEL: Record<string, string> = {
  // Account and sign-in
  signed_up: 'Signed up',
  signed_in: 'Signed in',
  sign_in_failed: 'Sign-in refused',
  signed_out: 'Signed out',
  pin_reset: 'Reset their PIN (forgot PIN)',
  pin_changed: 'Changed their PIN',
  unlocked_with_fingerprint: 'Unlocked the app with fingerprint',
  fingerprint_turned_on: 'Turned on fingerprint',
  fingerprint_turned_off: 'Turned off fingerprint',
  approval_started: 'Started an approval',
  approved_with_fingerprint: 'Approved with fingerprint',
  approved_with_code: 'Approved with an email code',
  face_check_started: 'Started a face check',
  approved_with_face: 'Approved with a face check',
  phone_change_started: 'Started changing their phone number',
  phone_changed: 'Changed their phone number',
  session_ended: 'Signed out another device',
  trusted_phone_removed: 'Removed a trusted phone',
  push_turned_on: 'Turned on phone notifications',
  push_turned_off: 'Turned off phone notifications',
  notification_read: 'Read a notification',
  // Identity
  identity_check_started: 'Started an identity check',
  bvn_submitted: 'Sent their BVN',
  address_submitted: 'Sent their address',
  proof_of_address_submitted: 'Sent proof of address',
  source_of_funds_submitted: 'Sent source of funds',
  // Market and deals
  offer_posted: 'Posted an offer',
  request_posted: 'Posted a buy request',
  offer_edited: 'Edited an offer',
  offer_withdrawn: 'Withdrew an offer',
  offer_taken: 'Took an offer',
  queue_joined: 'Joined a waiting queue',
  queue_left: 'Left a waiting queue',
  payout_accounts_chosen: 'Chose payout accounts',
  payment_time_extended: 'Asked for more time to pay',
  paid_into_escrow_pretend: 'Paid into escrow (pretend bank)',
  payout_account_added: 'Added a payout account',
  payout_account_removed: 'Removed a payout account',
  dispute_opened: 'Opened a dispute',
  dispute_message_sent: 'Sent a message on a dispute',
  other: 'Other change',
  // Staff actions about the customer
  customer_suspended: 'Staff suspended the account',
  customer_reactivated: 'Staff reactivated the account',
  customer_closed: 'Staff closed the account',
  kyc_approval_recommended: 'Staff recommended approving the identity check',
  kyc_approved: 'Staff approved the identity check',
  kyc_rejected: 'Staff rejected the identity check',
  kyc_recommendation_declined: 'Staff declined the recommendation',
  fraud_alert_raised: 'Staff reported fraud',
  fraud_alert_in_progress: 'Staff started on a fraud alert',
  fraud_alert_resolved: 'Staff closed a fraud alert',
  dispute_opened_for_customer: 'Staff opened a case for the customer',
  dispute_replied: 'Staff replied on a dispute',
  dispute_assigned: 'Staff assigned a dispute',
  dispute_escalated: 'Staff escalated a dispute',
  dispute_in_progress: 'Staff started on a dispute',
  dispute_resolved: 'Staff resolved a dispute',
  dispute_refund_requested: 'Staff asked for a refund',
  reversal_approved: 'Staff approved a refund',
  reversal_rejected: 'Staff rejected a refund',
};

export const CATEGORY_LABEL: Record<ActivityCategory, string> = {
  account: 'Account',
  security: 'Security',
  identity: 'Identity',
  market: 'Market',
  deal: 'Deals',
  payout: 'Payout accounts',
  dispute: 'Disputes',
  other: 'Other',
  staff: 'Staff actions',
};

export const OUTCOME_LABEL: Record<'done' | 'refused' | 'failed', string> = {
  done: 'Done',
  refused: 'Refused',
  failed: 'Failed',
};

/** Deal timeline steps (escrow events keep the server's names as keys). */
export const EVENT_LABEL: Record<string, string> = {
  offer_posted: 'Offer posted',
  offer_taken: 'Offer taken',
  payout_accounts_chosen: 'Payout accounts chosen',
  SettlementCreated: 'Escrow set up',
  EscrowProvisioned: 'Escrow account opened at the bank',
  EscrowProvisioningFailed: 'The bank could not open the escrow account',
  FundingExtended: 'More time given to pay',
  EscrowFunded: 'Payment arrived in escrow',
  HoldOpened: 'Hold placed',
  FundingWindowExpired: 'Time to pay ran out',
  EscrowReturnInitiated: 'Returning the money',
  EscrowReturned: 'Money returned',
  ReversalApproved: 'Refund approved',
  ReleaseAuthorized: 'Payout approved',
  ReleaseSent: 'Payout sent to the bank',
  PayoutFailed: 'Payout failed',
  PayoutConfirmed: 'Payout confirmed by the bank',
  SettlementUnwound: 'Deal undone, money returned',
  SettlementCancelled: 'Deal cancelled',
  SettlementCompleted: 'Deal completed',
  HoldClosed: 'Hold lifted',
  hold_opened: 'Hold placed',
  hold_closed: 'Hold lifted',
  dispute_opened: 'Dispute opened',
  dispute_resolved: 'Dispute resolved',
  refund_requested: 'Refund requested',
  refund_approved: 'Refund approved',
  refund_rejected: 'Refund rejected',
};

export const BY_LABEL: Record<string, string> = {
  offer_owner: 'Offer owner',
  taker: 'Taker',
  system: 'Xspeeria',
  staff: 'Staff',
};

function words(key: string): string {
  const s = key.replace(/^customer:/, '').replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function activityLabel(action: string): string {
  return ACTIVITY_LABEL[action] ? tr(ACTIVITY_LABEL[action]) : words(action);
}

export function eventLabel(kind: string): string {
  if (kind.startsWith('customer:')) return activityLabel(kind.slice('customer:'.length));
  return EVENT_LABEL[kind] ? tr(EVENT_LABEL[kind]) : words(kind);
}
