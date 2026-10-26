/** Trade limits from the server (ADR-058). */

import { ApiError } from '../../api/client';
import { limitsApi } from '../../api/limitsApi';
import { tr } from '../../i18n';
import { serverAuth } from '../auth/serverAuth';
import type { LimitsSource } from './MyLimitsScreen';

export const serverLimits: LimitsSource = {
  get: async () => {
    const t = serverAuth.accessToken();
    if (!t) throw new ApiError('AUTH_401_UNAUTHORIZED', 401, tr('Please log in again.'));
    return limitsApi.mine(t, serverAuth.apiOptions());
  },
};
