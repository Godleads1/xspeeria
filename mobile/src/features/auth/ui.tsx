/** Shared onboarding pieces (Figma onboarding frames), ADR-013. */

import type { ReactElement, ReactNode } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

import { RoundFlag } from '../../components/flags';
import { Icon } from '../../components/icons';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { DEMO_MODE } from './demo';

/** "← Previous" (optional), the English language chip, and step bars (optional). */
export function AuthTop({ onBack, step, steps = 3 }: { onBack?: () => void; step?: number; steps?: number }): ReactElement {
  return (
    <View style={styles.top}>
      <View style={styles.topRow}>
        {onBack ? (
          <Pressable testID="auth-back" accessibilityRole="button" accessibilityLabel="Previous" onPress={onBack} hitSlop={10} style={styles.prev}>
            <Icon name="back" color={color.text.secondary} size={18} />
            <Text style={styles.prevText}>Previous</Text>
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.lang} accessible accessibilityLabel="Language: English">
          <RoundFlag code="USD" size={16} />
          <Text style={styles.langText}>English</Text>
        </View>
      </View>
      {step !== undefined ? (
        <View style={styles.bars} accessible accessibilityLabel={`Step ${step} of ${steps}`}>
          {Array.from({ length: steps }, (_, i) => (
            <View key={i} style={[styles.bar, i < step ? styles.barOn : null]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function Heading({ title, body }: { title: string; body?: string }): ReactElement {
  return (
    <View style={styles.heading}>
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
    </View>
  );
}

export function CheckRow({
  checked,
  onToggle,
  children,
  testID,
}: {
  checked: boolean;
  onToggle: () => void;
  children: ReactNode;
  testID: string;
}): ReactElement {
  return (
    <Pressable testID={testID} accessibilityRole="checkbox" accessibilityState={{ checked }} onPress={onToggle} style={styles.check}>
      <View style={[styles.box, checked ? styles.boxOn : null]}>
        {checked ? <Icon name="check" color={color.text.onFill} size={13} weight={2.5} /> : null}
      </View>
      <Text style={styles.checkText}>{children}</Text>
    </Pressable>
  );
}

/** Secondary outlined button ("I have a profile", "Not now", "Verify using OTP"). */
export function GhostButton({ label, onPress, testID }: { label: string; onPress: () => void; testID: string }): ReactElement {
  return (
    <Pressable testID={testID} accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ghost, pressed ? styles.ghostPressed : null]}>
      <Text style={styles.ghostText}>{label}</Text>
    </Pressable>
  );
}

/** Flag + dialling code + number. `country` decides the flag and prefix. */
export function PhoneInput({
  country,
  value,
  onChange,
  onPickCountry,
  testID,
}: {
  country: 'NG' | 'GB';
  value: string;
  onChange: (t: string) => void;
  onPickCountry?: () => void;
  testID: string;
}): ReactElement {
  const code = country === 'NG' ? '+234' : '+44';
  return (
    <View style={styles.phone}>
      <Pressable
        testID={`${testID}-country`}
        accessibilityRole={onPickCountry ? 'button' : undefined}
        accessibilityLabel={`Country code ${code}`}
        disabled={!onPickCountry}
        onPress={onPickCountry}
        style={styles.country}
      >
        <RoundFlag code={country === 'NG' ? 'NGN' : 'GBP'} size={22} />
        {onPickCountry ? <Icon name="caret" color={color.text.secondary} size={12} /> : null}
        <Text style={styles.code}>{code}</Text>
      </Pressable>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^\d ]/g, ''))}
        placeholder="enter"
        placeholderTextColor={color.text.disabled}
        keyboardType="phone-pad"
        autoComplete="tel"
        accessibilityLabel="Phone number"
        maxLength={14}
        style={styles.phoneInput}
      />
    </View>
  );
}

/** Builds +CC number from the parts. */
export function fullPhone(country: 'NG' | 'GB', local: string): string {
  const digits = local.replace(/\D/g, '').replace(/^0/, '');
  return `${country === 'NG' ? '+234' : '+44'}${digits}`;
}

/** Visible on every simulated step while DEMO_MODE is on. */
export function DemoNote({ children, testID }: { children: ReactNode; testID?: string }): ReactElement | null {
  if (!DEMO_MODE) return null;
  return (
    <Text testID={testID} style={styles.demo}>
      {children}
    </Text>
  );
}

/** Figma PIN screens: dots and a 3×4 keypad (no letters), "<" deletes. */
export function PinPad({ value, onChange, length = 4 }: { value: string; onChange: (v: string) => void; length?: number }): ReactElement {
  const press = (k: string): void => {
    if (k === 'del') onChange(value.slice(0, -1));
    else if (value.length < length) onChange(value + k);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'];
  return (
    <View style={styles.pinWrap}>
      <View style={styles.dots} accessible accessibilityLabel={`${value.length} of ${length} digits entered`}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={[styles.dot, i < value.length ? styles.dotOn : null]} />
        ))}
      </View>
      <View style={styles.keys}>
        {keys.map((k, i) =>
          k === '' ? (
            <View key={i} style={styles.key} />
          ) : (
            <Pressable
              key={i}
              testID={`pin-key-${k}`}
              accessibilityRole="button"
              accessibilityLabel={k === 'del' ? 'Delete' : k}
              onPress={() => press(k)}
              style={({ pressed }) => [styles.key, pressed ? styles.keyPressed : null]}
            >
              <Text style={styles.keyText}>{k === 'del' ? '<' : k}</Text>
            </Pressable>
          ),
        )}
      </View>
    </View>
  );
}

const styles = themed(() => ({
  top: { gap: 12, paddingTop: space.xs },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 32 },
  prev: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  prevText: { ...typography.body, fontSize: 15, color: color.text.secondary },
  lang: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: color.bg.sunken, borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6 },
  langText: { ...typography.caption, color: color.text.secondary },
  bars: { flexDirection: 'row', gap: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: color.border.subtle },
  barOn: { backgroundColor: color.brand.fill },
  heading: { gap: 8, marginTop: space.sm },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 24, color: color.text.primary },
  body: { ...typography.body, fontSize: 15, lineHeight: 22, color: color.text.secondary },
  check: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', paddingVertical: 6 },
  box: { width: 20, height: 20, borderRadius: 4, borderWidth: 1.5, borderColor: color.border.strong, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  boxOn: { backgroundColor: color.brand.fill, borderColor: color.brand.fill },
  checkText: { flex: 1, ...typography.caption, fontSize: 12, lineHeight: 18, color: color.text.primary },
  ghost: { height: 52, borderRadius: 12, borderWidth: 1, borderColor: color.border.subtle, alignItems: 'center', justifyContent: 'center' },
  ghostPressed: { backgroundColor: color.bg.sunken },
  ghostText: { ...typography.body, ...brandWeight('700'), fontSize: 16, color: color.text.primary },
  phone: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minHeight: 40 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  code: { ...typography.body, fontSize: 15, color: color.text.secondary },
  phoneInput: { flex: 1, ...typography.body, fontSize: 16, color: color.text.primary, paddingVertical: 0 },
  demo: { ...typography.caption, color: color.warning.text, backgroundColor: color.warning.surface, padding: 10, borderRadius: 8 },
  pinWrap: { alignItems: 'center', gap: space.lg },
  dots: { flexDirection: 'row', gap: 22, marginVertical: space.md },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: color.border.strong, opacity: 0.5 },
  dotOn: { backgroundColor: color.brand.primary, opacity: 1 },
  keys: { flexDirection: 'row', flexWrap: 'wrap', width: '100%' },
  key: { width: '33.33%', height: 64, alignItems: 'center', justifyContent: 'center' },
  keyPressed: { backgroundColor: color.bg.sunken, borderRadius: 32 },
  keyText: { fontSize: 24, color: color.text.primary, ...brandWeight('500') },
}));

/**
 * Shown instead of the app in a release build while only demo services exist (ADR-018).
 * There is no log-in path behind it: the demo account and simulated checks are off.
 */
export function UnavailableBuild(): ReactElement {
  return (
    <View testID="unavailable-build" style={unavailableStyles.screen}>
      <Text accessibilityRole="header" style={unavailableStyles.title}>Not available yet</Text>
      <Text style={unavailableStyles.body}>
        This version of Xspeeria isn’t connected to our services yet, so you can’t sign up or log in. Please use an
        official release from your app store.
      </Text>
    </View>
  );
}

const unavailableStyles = themed(() => ({
  screen: { flex: 1, justifyContent: 'center', paddingHorizontal: space.lg, backgroundColor: color.bg.canvas },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 24, color: color.text.primary, textAlign: 'center' },
  body: { ...typography.body, lineHeight: 22, color: color.text.secondary, textAlign: 'center', marginTop: space.sm },
}));
