/**
 * Outage notices on Home (ADR-066; owner 2026-10-26: "Show a notice only").
 *
 * Staff report an outage in the web admin; while it lasts, every signed-in user sees it here.
 * It only informs: nothing in the app is blocked. The service name and message are staff's own
 * words and are shown as written. Most serious first (the server sorts them).
 */

import type { ReactElement } from 'react';
import { Text, View } from 'react-native';

import type { ServiceNotice } from '../../api/noticesApi';
import { Icon } from '../../components/icons';
import { dayMonthYear, tr } from '../../i18n';
import { brandWeight, color, space, themed, typography } from '../../theme';

function time(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${dayMonthYear(d.getDate(), d.getMonth(), d.getFullYear(), true)}, ${hh}:${mm}`;
}

function tone(s: ServiceNotice['severity']): { surface: string; border: string; fill: string } {
  if (s === 'high') return { surface: color.error.surface, border: color.error.border, fill: color.error.fill };
  if (s === 'medium') return { surface: color.warning.surface, border: color.warning.border, fill: color.warning.fill };
  return { surface: color.brand.secondarySurface, border: color.brand.secondary, fill: color.brand.secondary };
}

export function ServiceNotices({ notices }: { notices: readonly ServiceNotice[] }): ReactElement | null {
  if (notices.length === 0) return null;
  return (
    <View testID="service-notices" style={styles.list}>
      {notices.map((n) => {
        const t = tone(n.severity);
        return (
          <View
            key={n.id}
            testID={`service-notice-${n.id}`}
            accessibilityRole="summary"
            accessibilityLabel={`${tr('Service notice')}: ${n.service}. ${n.message}`}
            style={[styles.card, { backgroundColor: t.surface, borderColor: t.border }]}
          >
            <View style={[styles.icon, { backgroundColor: t.fill }]}>
              <Icon name="info" color={color.text.onFill} size={16} weight={2.25} />
            </View>
            <View style={styles.text}>
              <Text style={styles.title}>{n.service}</Text>
              <Text style={styles.message}>{n.message}</Text>
              {n.expected_end_at ? (
                <Text testID={`service-notice-end-${n.id}`} style={styles.meta}>
                  {tr('Expected back by {{time}}', { time: time(n.expected_end_at) })}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = themed(() => ({
  list: { gap: space.sm },
  card: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  icon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  text: { flex: 1, gap: 2 },
  title: { ...typography.body, ...brandWeight('700'), color: color.text.primary },
  message: { ...typography.caption, fontSize: 13, lineHeight: 18, color: color.text.primary },
  meta: { ...typography.caption, color: color.text.secondary },
}));
