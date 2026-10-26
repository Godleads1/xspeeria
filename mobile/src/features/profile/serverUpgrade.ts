/** Tier 2 and Tier 3 checks against the server (ADR-058). */

import * as ImagePicker from 'expo-image-picker';

import { ApiError } from '../../api/client';
import { tierChecksApi } from '../../api/limitsApi';
import { tr } from '../../i18n';
import { serverAuth } from '../auth/serverAuth';
import type { UpgradeSource } from './UpgradeTierScreen';

function token(): string {
  const t = serverAuth.accessToken();
  if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
  return t;
}

/** Photos only, as JPEG or PNG; the file is read once and not kept on the phone by us. */
const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const serverUpgrade: UpgradeSource = {
  get: async () => tierChecksApi.get(token(), serverAuth.apiOptions()),
  bvn: async (bvn) => tierChecksApi.bvn(token(), bvn, serverAuth.apiOptions()),
  address: async (a) => tierChecksApi.address(token(), a, serverAuth.apiOptions()),
  proofOfAddress: async (doc) => tierChecksApi.proofOfAddress(token(), doc.base64, doc.contentType, serverAuth.apiOptions()),
  sourceOfFunds: async (source, note) => tierChecksApi.sourceOfFunds(token(), source, note, serverAuth.apiOptions()),
  pickDocument: async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7, base64: true, exif: false });
    const asset = res.canceled ? null : res.assets[0];
    if (!asset?.base64) return null;
    const type = asset.mimeType && ALLOWED.has(asset.mimeType) ? asset.mimeType : 'image/jpeg';
    return { base64: asset.base64, contentType: type };
  },
};
