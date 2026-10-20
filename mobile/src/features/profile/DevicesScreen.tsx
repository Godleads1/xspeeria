/**
 * Signed-in devices (server builds; ADR-025/026). Lists every device signed in to the account,
 * with "This device" marked, and lets the user sign out any other one. Below, the devices that
 * may log in with the PIN only for 30 days, each of which can be un-trusted.
 *
 * The server decides everything; this screen only asks and shows. Signing out the current
 * device is not offered here (Log out does that).
 */

import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { messageFor } from '../../api/client';
import type { ServerSession, ServerTrustedDevice } from '../../api/devicesApi';
import { Icon } from '../../components/icons';
import { ErrorState, LoadingState } from '../../components/primitives';
import { brandWeight, color, space, typography, themed } from '../../theme';
import { dayMonth, tr } from "../../i18n";

export interface DevicesSource {
  sessions(): Promise<ServerSession[]>;
  signOut(id: string): Promise<void>;
  trusted(): Promise<ServerTrustedDevice[]>;
  untrust(id: string): Promise<void>;
}

/** A readable name from the browser/app identity string. Never shown raw. */
export function deviceName(userAgent: string | null): string {
  const ua = userAgent ?? '';
  const os = /iPhone|iPad|iOS/i.test(ua)
    ? 'iPhone'
    : /Android/i.test(ua)
      ? tr("Android phone")
      : /Windows/i.test(ua)
        ? tr("Windows computer")
        : /Mac OS|Macintosh/i.test(ua)
          ? 'Mac'
          : /Linux/i.test(ua)
            ? tr("Linux computer")
            : null;
  const app = /Expo|okhttp|CFNetwork|Xspeeria/i.test(ua)
    ? tr("Xspeeria app")
    : /Edg\//.test(ua)
      ? 'Edge'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : null;
  if (os && app) return tr("{{app}} on {{os}}", { app, os });
  return os ?? app ?? tr("Unknown device");
}

function when(iso: string | null): string {
  if (!iso) return tr('never');
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const date = dayMonth(d.getDate(), d.getMonth());
  return `${date}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DevicesScreen({ source, onBack }: { source: DevicesSource; onBack: () => void }): ReactElement {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<ServerSession[] | null>(null);
  const [trusted, setTrusted] = useState<ServerTrustedDevice[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoadError(null);
    Promise.all([source.sessions(), source.trusted()]).then(
      ([s, t]) => {
        setSessions(s);
        setTrusted(t);
      },
      (e: unknown) => setLoadError(messageFor(e)),
    );
  }, [source]);
  useEffect(load, [load]);

  const act = async (id: string, fn: () => Promise<void>, after: () => void): Promise<void> => {
    setBusy(id);
    setError(null);
    try {
      await fn();
      after();
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setBusy(null);
    }
  };

  const header = (
    <View style={styles.header}>
      <Pressable testID="devices-back" accessibilityRole="button" accessibilityLabel={tr("Back")} onPress={onBack} hitSlop={12}>
        <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
      </Pressable>
      <Text accessibilityRole="header" style={styles.title}>{tr("Signed-in devices")}</Text>
      <View style={styles.spacer} />
    </View>
  );

  if (sessions === null) {
    return (
      <View testID="devices-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
        {header}
        {loadError ? <ErrorState title={loadError} onRetry={load} /> : <LoadingState label={tr("Loading your devices")} />}
      </View>
    );
  }

  return (
    <View testID="devices-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      {header}
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.section}>{tr("Signed in now")}</Text>
        {sessions.map((s) => (
          <View key={s.session_id} testID={`session-${s.session_id}`} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.name}>{deviceName(s.user_agent)}</Text>
              <Text style={styles.meta}>
                {s.current ? tr("This device") : tr("Last active {{last_active_at}}", { last_active_at: when(s.last_active_at) })}
              </Text>
            </View>
            {s.current ? null : (
              <Pressable
                testID={`session-signout-${s.session_id}`}
                accessibilityRole="button"
                accessibilityLabel={tr("Sign out {{user_agent}}", { user_agent: deviceName(s.user_agent) })}
                disabled={busy !== null}
                onPress={() =>
                  void act(s.session_id, () => source.signOut(s.session_id), () =>
                    setSessions((old) => (old ?? []).filter((x) => x.session_id !== s.session_id)),
                  )
                }
                hitSlop={8}
              >
                <Text style={styles.action}>{busy === s.session_id ? tr("Signing out…") : tr("Sign out")}</Text>
              </Pressable>
            )}
          </View>
        ))}

        <Text style={styles.section}>{tr("Trusted devices")}</Text>
        <Text style={styles.note}>{tr("These can log in with your PIN only for 30 days. A new phone needs an extra check.")}</Text>
        {trusted.length === 0 ? (
          <Text testID="trusted-empty" style={styles.meta}>{tr("No trusted devices.")}</Text>
        ) : (
          trusted.map((d) => (
            <View key={d.trusted_device_id} testID={`trusted-${d.trusted_device_id}`} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{deviceName(d.user_agent)}</Text>
                <Text style={styles.meta}>{tr("Trusted until {{expires_at}}", { expires_at: when(d.expires_at) })}</Text>
              </View>
              <Pressable
                testID={`trusted-remove-${d.trusted_device_id}`}
                accessibilityRole="button"
                accessibilityLabel={tr("Stop trusting {{user_agent}}", { user_agent: deviceName(d.user_agent) })}
                disabled={busy !== null}
                onPress={() =>
                  void act(d.trusted_device_id, () => source.untrust(d.trusted_device_id), () =>
                    setTrusted((old) => old.filter((x) => x.trusted_device_id !== d.trusted_device_id)),
                  )
                }
                hitSlop={8}
              >
                <Text style={styles.action}>{busy === d.trusted_device_id ? 'Removing…' : tr("Stop trusting")}</Text>
              </Pressable>
            </View>
          ))
        )}
        {error ? (
          <Text testID="devices-error" accessibilityRole="alert" style={styles.error}>
            {error}
          </Text>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  screen: { flex: 1, backgroundColor: color.bg.canvas, paddingHorizontal: space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { ...typography.headline, color: color.text.primary },
  spacer: { width: 22 },
  body: { gap: 4, paddingBottom: space.lg },
  section: { ...typography.caption, ...brandWeight('700'), color: color.text.secondary, marginTop: space.md },
  note: { ...typography.caption, color: color.text.secondary },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  rowText: { flex: 1, gap: 2 },
  name: { ...typography.body, color: color.text.primary },
  meta: { ...typography.caption, color: color.text.secondary },
  action: { ...typography.caption, ...brandWeight('700'), fontSize: 13, color: color.error.text },
  error: { ...typography.caption, fontSize: 13, color: color.error.text, marginTop: space.sm },
}));
