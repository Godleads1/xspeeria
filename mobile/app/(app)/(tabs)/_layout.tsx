import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';

import { Icon, type IconName } from '../../../src/components/icons';
import { color, typography, useThemeMode } from '../../../src/theme';
import { TABS, type TabName } from '../../../src/navigation/tabs';

/**
 * Screens render their own header, so the navigation header is off: leaving it on
 * duplicated every screen title and produced the generic bar the Figma direction does
 * not have.
 */
const ICON_FOR: Record<TabName, IconName> = {
  index: 'home',
  marketplace: 'market',
  history: 'history',
  cards: 'cards',
  profile: 'profile',
};

export default function TabsLayout(): ReactElement {
  useThemeMode(); // tab bar repaints on light/dark change (ADR-010)
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: color.bg.canvas },
        tabBarActiveTintColor: color.brand.primary,
        tabBarInactiveTintColor: color.text.secondary,
        // Figma paints the navigation bar on the soft surface, not the canvas.
        tabBarStyle: {
          backgroundColor: color.bg.sunken,
          borderTopColor: color.border.subtle,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: typography.navLabel,
        tabBarIconStyle: { marginBottom: 2 },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: tab.comingSoon ? `${tab.title}, coming soon` : tab.title,
            // The active glyph turns solid as well as changing the tint (as in Figma), so
            // the selection is never carried by colour alone.
            tabBarIcon: ({ color: tint, focused }) => (
              <Icon
                name={ICON_FOR[tab.name]}
                color={tint}
                size={24}
                filled={focused}
                knockout={color.bg.sunken}
              />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
