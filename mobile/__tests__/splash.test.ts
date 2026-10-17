/**
 * Splash screen guard — Figma frame "iPhone 13 & 14 - 1" (node 33:1355).
 *
 * The splash is native (expo-splash-screen), so it is configured in app.json rather than
 * rendered in React. app.json cannot import tokens, so this test keeps the two in step and
 * makes sure the splash uses the canonical logo file rather than a copy or a redraw.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { color } from '@xspeeria/tokens';

import appJson from '../app.json';

type SplashConfig = {
  image: string;
  imageWidth: number;
  resizeMode: string;
  backgroundColor: string;
};

function splashConfig(): SplashConfig {
  const entry = appJson.expo.plugins.find(
    (plugin): plugin is [string, SplashConfig] =>
      Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
  );
  if (!entry) throw new Error('expo-splash-screen is not configured in app.json');
  return entry[1];
}

describe('splash screen', () => {
  it('uses the Figma soft surface as its background', () => {
    expect(splashConfig().backgroundColor).toBe(color.bg.sunken);
  });

  it('uses the canonical brand logo file, unaltered', () => {
    const { image } = splashConfig();
    expect(image).toBe('../assets/brand/xspeeria-logo.png');
    expect(existsSync(join(__dirname, '..', image))).toBe(true);
  });

  it('centres the logo at the Figma width without cropping it', () => {
    const { imageWidth, resizeMode } = splashConfig();
    expect(imageWidth).toBe(290);
    expect(resizeMode).toBe('contain');
  });
});
