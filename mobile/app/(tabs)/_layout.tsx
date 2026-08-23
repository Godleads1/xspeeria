import type { ReactElement } from 'react';
import { Tabs } from 'expo-router';

import { color } from '../../src/theme';
import { TABS } from '../../src/navigation/tabs';

export default function TabsLayout(): ReactElement {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: color.brand.primary,
        tabBarInactiveTintColor: color.text.secondary,
        tabBarStyle: { backgroundColor: color.bg.canvas, borderTopColor: color.border.subtle },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarBadge: tab.comingSoon ? 'soon' : undefined,
          }}
        />
      ))}
    </Tabs>
  );
}
