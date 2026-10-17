/** History = this session's trades (newest first) + the mock history (ADR-014). */

import { useMemo } from 'react';

import { HISTORY, type HistoryItem } from '../history/data';
import { toHistoryItem, useTrades } from './tradeStore';

export function useAllHistory(): readonly HistoryItem[] {
  const trades = useTrades();
  return useMemo(() => [...trades.map(toHistoryItem), ...HISTORY], [trades]);
}
