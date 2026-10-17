/**
 * Manage Beneficiaries → "+" → Select Destination Country (Figma), ADR-007 A2.
 *
 * Back + "Manage Beneficiaries", heading, helper text, "Search country", then a list of
 * round flag · country · currency code. Only documented corridor countries are listed
 * (see DESTINATION_COUNTRIES). MOCK DATA ONLY.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundFlag } from '../../components/flags';
import { Icon } from '../../components/icons';
import { brandWeight, color, space, typography } from '../../theme';
import { DESTINATION_COUNTRIES, searchCountries, type DestinationCountry } from './data';

export function SelectCountryScreen({
  onBack,
  onSelect,
}: {
  onBack: () => void;
  onSelect?: (country: DestinationCountry) => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const shown = useMemo(() => searchCountries(DESTINATION_COUNTRIES, query), [query]);

  const choose = (c: DestinationCountry): void => {
    if (!c.available) return;
    if (onSelect) onSelect(c);
    else Alert.alert(c.name, 'Entering the bank details is the next screen to be built.');
  };

  return (
    <View testID="select-country-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="select-country-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text style={styles.title}>Manage Beneficiaries</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.intro}>
        <Text accessibilityRole="header" style={styles.heading}>Select Destination Country</Text>
        <Text style={styles.helper}>Choose the country you want to send money to</Text>
      </View>

      <View style={styles.search}>
        <Icon name="search" color={color.text.secondary} size={20} />
        <TextInput
          testID="select-country-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search country"
          placeholderTextColor={color.text.secondary}
          accessibilityLabel="Search country"
          autoCorrect={false}
          maxLength={60}
          style={styles.searchInput}
        />
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.lg }]} keyboardShouldPersistTaps="handled">
        {shown.length === 0 ? (
          <Text testID="select-country-empty" style={styles.empty}>No supported country matches</Text>
        ) : (
          shown.map((c) => (
            <Pressable
              key={c.currency}
              testID={`country-${c.currency}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !c.available }}
              accessibilityLabel={`${c.name}, ${c.currency}${c.note ? `. ${c.note}` : ''}`}
              disabled={!c.available}
              onPress={() => choose(c)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null, c.available ? null : styles.unavailable]}
            >
              <RoundFlag code={c.currency} size={28} />
              <View style={styles.rowText}>
                <Text style={styles.name}>{c.name}</Text>
                <Text style={styles.code}>{c.currency}</Text>
              </View>
              {c.note ? <Text style={styles.note}>{c.note}</Text> : null}
            </Pressable>
          ))
        )}
        <Text style={styles.footnote}>More countries will appear as new corridors open.</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.md, minHeight: 44 },
  title: { flex: 1, textAlign: 'center', ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  headerSpacer: { width: 22 },
  intro: { paddingHorizontal: space.md, paddingTop: space.md, gap: 6 },
  heading: { ...typography.headline, ...brandWeight('700'), fontSize: 20, color: color.text.primary },
  helper: { ...typography.body, fontSize: 14, color: color.text.secondary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: space.md,
    marginTop: space.md,
    marginBottom: space.xs,
    paddingHorizontal: space.sm,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  searchInput: { flex: 1, ...typography.body, fontSize: 15, color: color.text.primary, paddingVertical: 0 },
  list: { paddingHorizontal: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: 8 },
  pressed: { backgroundColor: color.bg.sunken },
  unavailable: { opacity: 0.5 },
  rowText: { flex: 1, gap: 2 },
  name: { ...typography.body, ...brandWeight('500'), fontSize: 16, color: color.text.primary },
  code: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  note: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  empty: { ...typography.body, color: color.text.secondary, textAlign: 'center', marginTop: space.lg },
  footnote: { ...typography.caption, color: color.text.secondary, textAlign: 'center', marginTop: space.md },
});
