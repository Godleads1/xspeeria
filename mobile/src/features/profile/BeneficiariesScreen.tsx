/**
 * Manage Beneficiaries (Figma, Profile → Manage Beneficiaries), ADR-007.
 *
 * Back + title, a "Search name" field, currency filter chips (All, USD, NGN, GBP, GHS),
 * the saved payout accounts (initials avatar with a currency flag badge, name, masked
 * account number, bank, delete) and a round "+" button to add one. Delete always asks
 * first. MOCK DATA ONLY — nothing leaves the device.
 */

import { useMemo, useState, type ReactElement } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { RoundFlag } from '../../components/flags';
import { Icon } from '../../components/icons';
import { brandWeight, color, interaction, space, typography } from '../../theme';
import { beneficiaryStore, useBeneficiaries } from './beneficiaryStore';
import {
  BENEFICIARY_FILTERS,
  filterBeneficiaries,
  initialsOf,
  maskAccount,
  type Beneficiary,
  type BeneficiaryFilter,
} from './data';

function FilterChip({
  value,
  selected,
  onPress,
}: {
  value: BeneficiaryFilter;
  selected: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Pressable
      testID={`beneficiary-filter-${value}`}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={value === 'All' ? 'All currencies' : value}
      onPress={onPress}
      style={[styles.chip, selected ? styles.chipSelected : null]}
    >
      {value === 'All' ? (
        <Icon name="globe" color={color.brand.primary} size={18} />
      ) : (
        <RoundFlag code={value} size={18} />
      )}
      <Text style={styles.chipText}>{value}</Text>
    </Pressable>
  );
}

function BeneficiaryRow({ item, onDelete }: { item: Beneficiary; onDelete: () => void }): ReactElement {
  return (
    <View testID={`beneficiary-${item.id}`} style={styles.row}>
      <View accessible accessibilityLabel={`${item.name}, ${item.currency}, ${item.bank}, account ending ${item.accountLast4}${item.status === 'pending' ? ', awaiting bank verification' : ''}`} style={styles.rowMain}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(item.name)}</Text>
          <View style={styles.flagBadge}>
            <RoundFlag code={item.currency} size={16} />
          </View>
        </View>
        <View style={styles.rowText}>
          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
          <Text style={styles.meta}>{maskAccount(item.accountLast4)}</Text>
          <Text style={styles.meta}>{item.bank}</Text>
          {item.status === 'pending' ? (
            <Text testID={`beneficiary-pending-${item.id}`} style={styles.pending}>Awaiting bank verification</Text>
          ) : null}
        </View>
      </View>
      <Pressable
        testID={`beneficiary-delete-${item.id}`}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${item.name}`}
        onPress={onDelete}
        hitSlop={10}
      >
        <Icon name="trash" color={color.error.text} size={22} />
      </Pressable>
    </View>
  );
}

export function BeneficiariesScreen({
  onBack,
  onAdd,
}: {
  onBack: () => void;
  onAdd?: () => void;
}): ReactElement {
  const insets = useSafeAreaInsets();
  const items = useBeneficiaries();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<BeneficiaryFilter>('All');
  const shown = useMemo(() => filterBeneficiaries(items, query, filter), [items, query, filter]);

  const confirmDelete = (b: Beneficiary): void =>
    Alert.alert('Delete beneficiary?', `${b.name} (${maskAccount(b.accountLast4)}) will be removed from your saved accounts.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => beneficiaryStore.remove(b.id) },
    ]);

  const add = (): void => {
    if (onAdd) onAdd();
    else Alert.alert('Add beneficiary', 'Adding a beneficiary is one of the next screens to be built.');
  };

  return (
    <View testID="beneficiaries-screen" style={[styles.screen, { paddingTop: insets.top + space.xs }]}>
      <View style={styles.header}>
        <Pressable testID="beneficiaries-back" accessibilityRole="button" accessibilityLabel="Back" onPress={onBack} hitSlop={12}>
          <Icon name="back" color={color.text.primary} size={22} weight={2.25} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.title}>Manage Beneficiaries</Text>
      </View>

      <View style={styles.search}>
        <Icon name="search" color={color.text.secondary} size={20} />
        <TextInput
          testID="beneficiaries-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Search name"
          placeholderTextColor={color.text.secondary}
          accessibilityLabel="Search name"
          autoCorrect={false}
          maxLength={60}
          style={styles.searchInput}
        />
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {BENEFICIARY_FILTERS.map((f) => (
            <FilterChip key={f} value={f} selected={f === filter} onPress={() => setFilter(f)} />
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}>
        {shown.length === 0 ? (
          <Text testID="beneficiaries-empty" style={styles.empty}>No beneficiaries found</Text>
        ) : (
          shown.map((b) => <BeneficiaryRow key={b.id} item={b} onDelete={() => confirmDelete(b)} />)
        )}
      </ScrollView>

      <Pressable
        testID="beneficiaries-add"
        accessibilityRole="button"
        accessibilityLabel="Add beneficiary"
        onPress={add}
        style={({ pressed }) => [styles.fab, { bottom: insets.bottom + space.md }, pressed ? styles.fabPressed : null]}
      >
        <Icon name="plus" color={color.text.onFill} size={26} weight={2.5} />
      </Pressable>
    </View>
  );
}

const AVATAR = 48;
const FAB = 56;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.bg.canvas },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, minHeight: 44 },
  title: { ...typography.headline, ...brandWeight('700'), fontSize: 18, color: color.text.primary },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: space.md,
    marginTop: space.sm,
    paddingHorizontal: space.sm,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
  },
  searchInput: { flex: 1, ...typography.body, fontSize: 15, color: color.text.primary, paddingVertical: 0 },
  chips: { gap: 10, paddingHorizontal: space.md, paddingVertical: space.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.canvas,
  },
  chipSelected: { borderColor: color.trade.advert, backgroundColor: color.bg.sunken },
  chipText: { ...typography.body, ...brandWeight('500'), fontSize: 14, color: color.text.primary },
  list: { paddingHorizontal: space.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.border.subtle,
  },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: color.bg.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { ...brandWeight('700'), fontSize: 16, color: color.brand.primary },
  flagBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: color.bg.canvas,
  },
  rowText: { flex: 1, gap: 2 },
  name: { ...typography.body, ...brandWeight('700'), fontSize: 15, color: color.text.primary },
  meta: { ...typography.caption, fontSize: 12, color: color.text.secondary },
  pending: { ...typography.caption, fontSize: 11, color: color.warning.text },
  empty: { ...typography.body, color: color.text.secondary, textAlign: 'center', marginTop: space.lg },
  fab: {
    position: 'absolute',
    right: space.md,
    width: FAB,
    height: FAB,
    borderRadius: FAB / 2,
    backgroundColor: color.brand.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabPressed: { backgroundColor: interaction.primary.pressed },
});
