/**
 * Choose the app language (ADR-053): English (UK), English (US), French, Arabic, Spanish,
 * Chinese (Simplified), Portuguese. Each language is listed in its own name so a person can
 * find theirs whatever the app is showing now. Arabic flips the layout after a restart.
 */

import type { ReactElement } from 'react';
import { Alert, Modal, Pressable, Text, View } from 'react-native';

import { Icon } from '../../components/icons';
import { LANGUAGES, isRtl, language, tr, useLanguage, type LanguageCode } from '../../i18n';
import { brandWeight, color, space, themed, typography } from '../../theme';

export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }): ReactElement {
  const current = useLanguage();

  const choose = (code: LanguageCode): void => {
    const flips = isRtl(code) !== isRtl(current);
    void language.set(code).then(() => {
      onClose();
      if (flips) {
        Alert.alert(
          tr('Restart Xspeeria'),
          tr('Close Xspeeria and open it again to finish switching the layout direction.'),
        );
      }
    });
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel={tr('Close')} />
      <View testID="language-sheet" style={styles.sheet}>
        <Text accessibilityRole="header" style={styles.title}>
          {tr('Language')}
        </Text>
        {LANGUAGES.map((l) => {
          const on = l.code === current;
          return (
            <Pressable
              key={l.code}
              testID={`language-${l.code}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={l.native}
              onPress={() => choose(l.code)}
              style={({ pressed }) => [styles.row, pressed ? styles.pressed : null]}
            >
              <Text style={[styles.name, on ? styles.on : null]}>{l.native}</Text>
              {on ? <Icon name="check" color={color.brand.secondary} size={18} weight={2.5} /> : null}
            </Pressable>
          );
        })}
        <Text style={styles.note}>{tr('Translations are new. Tell us if something reads wrong.')}</Text>
      </View>
    </Modal>
  );
}

/** The current language's own name, e.g. "Français". */
export function currentLanguageName(code: LanguageCode): string {
  return LANGUAGES.find((l) => l.code === code)?.native ?? 'English (UK)';
}

const styles = themed(() => ({
  scrim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: {
    backgroundColor: color.bg.canvas,
    paddingHorizontal: space.md,
    paddingTop: space.md,
    paddingBottom: space.lg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  title: { ...typography.headline, ...brandWeight('700'), color: color.text.primary, marginBottom: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  pressed: { opacity: 0.7 },
  name: { ...typography.body, color: color.text.primary },
  on: { ...brandWeight('700') },
  note: { ...typography.caption, color: color.text.secondary, marginTop: space.sm },
}));
