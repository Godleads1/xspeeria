/**
 * Icon set.
 *
 * Drawn from plain Views rather than an icon font or an SVG runtime. Xspeeria has no
 * approved icon library, no icon assets exist in this repository, and neither
 * `@expo/vector-icons` nor `react-native-svg` is a dependency — adding one is a
 * dependency decision, not a visual-polish decision. Geometry here is deliberately
 * simple: an outline stroke of uniform weight on a square optical box, so the set reads
 * as one family at navigation sizes.
 *
 * Colour is always supplied by the caller from the semantic token layer; no icon names a
 * colour itself.
 */

import type { ReactElement } from 'react';
import { StyleSheet, View, type ColorValue } from 'react-native';

export type IconName = 'home' | 'marketplace' | 'track' | 'cards' | 'profile' | 'bell';

/** Reference box the geometry below is authored against. */
const BOX = 24;

export function Icon({
  name,
  color,
  size = BOX,
  weight = 1.75,
}: {
  name: IconName;
  color: ColorValue;
  size?: number;
  /** Stroke weight. The active navigation state thickens it rather than filling it. */
  weight?: number;
}): ReactElement {
  const s = size / BOX;
  const w = weight;

  return (
    <View style={[styles.box, { width: size, height: size }]}>
      {name === 'home' ? (
        <View style={styles.stack}>
          {/* A square carrying only its top and left edges becomes a roof at 45deg. */}
          <View
            style={{
              width: 13 * s,
              height: 13 * s,
              borderColor: color,
              borderTopWidth: w,
              borderLeftWidth: w,
              borderTopLeftRadius: 3 * s,
              transform: [{ rotate: '45deg' }],
              marginBottom: -6.5 * s,
            }}
          />
          <View
            style={{
              width: 15 * s,
              height: 9 * s,
              borderColor: color,
              borderWidth: w,
              borderTopWidth: 0,
              borderBottomLeftRadius: 3 * s,
              borderBottomRightRadius: 3 * s,
            }}
          />
        </View>
      ) : null}

      {name === 'marketplace' ? (
        <View style={[styles.grid, { width: 18 * s, height: 18 * s }]}>
          {[0, 1, 2, 3].map((cell) => (
            <View
              key={cell}
              style={{
                width: 7.5 * s,
                height: 7.5 * s,
                borderColor: color,
                borderWidth: w,
                borderRadius: 2.5 * s,
              }}
            />
          ))}
        </View>
      ) : null}

      {name === 'track' ? (
        <View
          style={[
            styles.center,
            {
              width: 18 * s,
              height: 18 * s,
              borderColor: color,
              borderWidth: w,
              borderRadius: 9 * s,
            },
          ]}
        >
          <View
            style={{
              width: 6 * s,
              height: 6 * s,
              borderRadius: 3 * s,
              backgroundColor: color,
            }}
          />
        </View>
      ) : null}

      {name === 'cards' ? (
        <View style={[styles.center, { width: 20 * s, height: 16 * s }]}>
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 3 * s,
              width: 17 * s,
              height: 11 * s,
              borderColor: color,
              borderWidth: w,
              borderRadius: 3 * s,
            }}
          />
          <View
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              width: 17 * s,
              height: 11 * s,
              borderColor: color,
              borderWidth: w,
              borderRadius: 3 * s,
            }}
          />
        </View>
      ) : null}

      {name === 'profile' ? (
        <View style={styles.stack}>
          <View
            style={{
              width: 9 * s,
              height: 9 * s,
              borderColor: color,
              borderWidth: w,
              borderRadius: 4.5 * s,
              marginBottom: 2 * s,
            }}
          />
          <View
            style={{
              width: 17 * s,
              height: 8 * s,
              borderColor: color,
              borderWidth: w,
              borderBottomWidth: 0,
              borderTopLeftRadius: 8.5 * s,
              borderTopRightRadius: 8.5 * s,
            }}
          />
        </View>
      ) : null}

      {name === 'bell' ? (
        <View style={styles.stack}>
          <View
            style={{
              width: 14 * s,
              height: 11 * s,
              borderColor: color,
              borderWidth: w,
              borderBottomWidth: 0,
              borderTopLeftRadius: 7 * s,
              borderTopRightRadius: 7 * s,
            }}
          />
          <View
            style={{
              width: 19 * s,
              height: w,
              backgroundColor: color,
              borderRadius: w,
              marginTop: 1 * s,
            }}
          />
          <View
            style={{
              width: 5 * s,
              height: 2.5 * s,
              backgroundColor: color,
              borderBottomLeftRadius: 2.5 * s,
              borderBottomRightRadius: 2.5 * s,
              marginTop: 1 * s,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
  stack: { alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center' },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignContent: 'space-between',
    justifyContent: 'space-between',
  },
});
