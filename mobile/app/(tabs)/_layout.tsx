import type { ReactElement } from 'react';
import { StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';

import { Icon, type IconName } from '../../src/components/icons';
import { color, typography } from '../../src/theme';
import { TABS, type TabName } from '../../src/navigation/tabs';

/**
 * Screens render their own header, so the navigation header is off: leaving it on
 * duplicated every screen title and produced the generic bar the Figma direction does
 * not have.
 */
const ICON_FOR: Record<TabName, IconName> = {
  index: 'home',
  marketplace: 'marketplace',
  track: 'track',
  cards: 'cards',
  profile: 'profile',
};

export default function TabsLayout(): ReactElement {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.brand.primary,
        tabBarInactiveTintColor: color.text.secondary,
        tabBarStyle: {
          backgroundColor: color.bg.canvas,
          borderTopColor: color.border.subtle,
          borderTopWidth: StyleSheet.hairlineWidth,
        },
        tabBarLabelStyle: typography.navLabel,
        tabBarIconStyle: { marginBottom: 2 },
        /**
         * A subtle recap pill, not the default notification badge: "coming soon" is
         * information, not an alert, and the alert-red default read as an error.
         */
        tabBarBadgeStyle: {
          backgroundColor: color.bg.sunken,
          color: color.text.secondary,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: color.border.subtle,
          fontSize: 10,
          lineHeight: 14,
          minWidth: 0,
          paddingHorizontal: 5,
        },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: tab.comingSoon ? 'Soon' : undefined,
            tabBarAccessibilityLabel: tab.comingSoon ? `${tab.title}, coming soon` : tab.title,
            // The active state thickens the stroke as well as changing the tint, so the
            // selection is never carried by colour alone.
            tabBarIcon: ({ color: tint, focused }) => (
              <Icon name={ICON_FOR[tab.name]} color={tint} size={24} weight={focused ? 2.25 : 1.75} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
