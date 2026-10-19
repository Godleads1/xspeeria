/** Countries verified on the server, as the Account details list shows them (ADR-042). */

import { COUNTRY_FLAG, type ServerRegions } from '../../api/kycApi';
import type { KycRegion } from '../profile/data';

const NAME = { NG: 'Nigeria', GB: 'United Kingdom', US: 'United States' } as const;

/** Approved and in-progress countries (ADR-042); refused, expired and untouched ones are not listed. */
export function regionsFromServer(r: ServerRegions): KycRegion[] {
  return r.regions.flatMap((x): KycRegion[] => {
    if (x.status === 'approved') return [{ flag: COUNTRY_FLAG[x.country], name: NAME[x.country], state: 'approved' }];
    if (x.status === 'pending_documents' || x.status === 'under_review') {
      return [{ flag: COUNTRY_FLAG[x.country], name: NAME[x.country], state: 'pending' }];
    }
    return [];
  });
}

