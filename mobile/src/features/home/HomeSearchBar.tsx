/**
 * "Find a deal" on Home (ADR-059 Decision 1): a search box, a sort-and-filter button and
 * quick currency chips. It only collects what to look for; the search screen asks the server.
 */

import { useState, type ReactElement } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { Icon } from '../../components/icons';
import { tr } from '../../i18n';
import { brandWeight, color, space, themed, typography } from '../../theme';
import { shownSearchCurrencies, type SearchCurrency } from '../search/searchModel';

export interface HomeSearch {
  readonly query: string;
  readonly currency?: SearchCurrency;
  readonly filters?: boolean;
}

export function HomeSearchBar({
  onSearch,
  offered,
}: {
  onSearch: (s: HomeSearch) => void;
  /** The currencies the server offers now (server builds); see `shownSearchCurrencies`. */
  offered?: ReadonlySet<string> | null;
}): ReactElement {
  const [query, setQuery] = useState('');
  const chips = shownSearchCurrencies(offered);
  return (
    <View testID="home-search" style={styles.wrap}>
      <Text nativeID="home-search-label" style={styles.label}>{tr('FIND A DEAL')}</Text>
      <View style={styles.line}>
        <View style={styles.box}>
          <Icon name="search" color={color.text.secondary} size={20} />
          <TextInput
            testID="home-search-input"
            accessibilityLabel={tr('Find a deal')}
            accessibilityLabelledBy="home-search-label"
            value={query}
            onChangeText={(t) => setQuery(t.slice(0, 40))}
            onSubmitEditing={() => onSearch({ query })}
            returnKeyType="search"
            placeholder={tr('Search {{currencies}} offers', { currencies: chips.length > 4 ? `${chips.slice(0, 4).join(', ')}…` : chips.join(', ') })}
            placeholderTextColor={color.text.secondary}
            autoCorrect={false}
            autoCapitalize="none"
            style={styles.input}
          />
        </View>
        <Pressable
          testID="home-search-filters"
          accessibilityRole="button"
          accessibilityLabel={tr('Sort and filter')}
          onPress={() => onSearch({ query, filters: true })}
          style={({ pressed }) => [styles.filter, pressed ? styles.pressed : null]}
        >
          <Icon name="sort" color={color.text.onFill} size={22} />
        </Pressable>
      </View>
      {/* Up to 15 currencies (ADR-107): the chips scroll sideways rather than run off screen. */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="home-search-chips" contentContainerStyle={styles.chips}>
        {chips.map((c) => (
          <Pressable
            key={c}
            testID={`home-search-${c}`}
            accessibilityRole="button"
            accessibilityLabel={tr('Search {{currency}} offers', { currency: c })}
            onPress={() => onSearch({ query: '', currency: c })}
            style={({ pressed }) => [styles.chip, pressed ? styles.pressed : null]}
          >
            <Text style={styles.chipText}>{c}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = themed(() => ({
  wrap: { gap: 10 },
  label: { ...typography.chipLabel, fontSize: 13, letterSpacing: 0.5, color: color.text.secondary },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  box: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border.subtle,
    backgroundColor: color.bg.sunken,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
  },
  input: { flex: 1, ...typography.body, color: color.text.primary, paddingVertical: 0 },
  filter: { width: 52, height: 52, borderRadius: 12, backgroundColor: color.brand.primary, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', gap: 8, paddingTop: space.xs / 2 },
  chip: { height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: color.border.subtle, justifyContent: 'center' },
  chipText: { ...brandWeight('600'), fontSize: 13, color: color.text.primary },
  pressed: { opacity: 0.7 },
}));
