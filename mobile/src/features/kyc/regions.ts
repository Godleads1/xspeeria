/** Countries verified on the server, as the Account details list shows them (ADR-042). */

import { COUNTRY_FLAG, type ServerRegions } from '../../api/kycApi';
import type { KycRegion } from '../profile/data';
import { k } from "../../i18n";

const NAME = {
  NG: 'Nigeria',
  GB: k("United Kingdom"),
  US: k("United States"),
  CA: k("Canada"),
  DE: k("Germany"),
  FR: k("France"),
  CN: k("China"),
  EG: k("Egypt"),
  ZA: k("South Africa"),
  MA: k("Morocco"),
  ET: k("Ethiopia"),
  KE: k("Kenya"),
  SN: k("Senegal"),
  GH: k("Ghana"),
  ZW: k("Zimbabwe"),
  UG: k("Uganda"),
  ZM: k("Zambia"),
  TZ: k("Tanzania"),
} as const;

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

