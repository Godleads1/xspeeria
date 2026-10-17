import type React from 'react';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { color as lightColor, colorDark } from '@xspeeria/tokens';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

import { color, getThemeMode, loadSavedThemeMode, setThemeMode, themed, useThemeMode } from '../src/theme';

afterEach(() => act(() => setThemeMode('light', false)));

describe('live colours (ADR-010)', () => {
  it('follow the mode', () => {
    expect(color.bg.canvas).toBe(lightColor.bg.canvas);
    setThemeMode('dark', false);
    expect(color.bg.canvas).toBe(colorDark.bg.canvas);
    expect(color.text.primary).toBe(colorDark.text.primary);
  });

  it('themed() styles rebuild per mode and keep their keys', () => {
    const styles = themed(() => ({ box: { backgroundColor: color.bg.canvas } }));
    expect(styles.box.backgroundColor).toBe(lightColor.bg.canvas);
    setThemeMode('dark', false);
    expect(styles.box.backgroundColor).toBe(colorDark.bg.canvas);
    expect(Object.keys(styles)).toEqual(['box']);
  });

  it('subscribers re-render on change', async () => {
    function Probe(): React.ReactElement {
      const mode = useThemeMode();
      return <Text>{`${mode}:${color.bg.canvas}`}</Text>;
    }
    await render(<Probe />);
    expect(screen.getByText(`light:${lightColor.bg.canvas}`)).toBeTruthy();
    await act(async () => setThemeMode('dark', false));
    expect(screen.getByText(`dark:${colorDark.bg.canvas}`)).toBeTruthy();
  });

  it('remembers the choice and ignores junk', async () => {
    await act(async () => setThemeMode('dark'));
    expect(await AsyncStorage.getItem('xspeeria.themeMode')).toBe('dark');
    await act(async () => setThemeMode('light', false));
    await act(async () => loadSavedThemeMode());
    expect(getThemeMode()).toBe('dark');
    await AsyncStorage.setItem('xspeeria.themeMode', 'purple');
    await act(async () => setThemeMode('light', false));
    await act(async () => loadSavedThemeMode());
    expect(getThemeMode()).toBe('light');
  });
});

/** Guard for future screens: dark mode works only if styles and routes follow the rules. */
describe('every screen supports dark mode', () => {
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(f) ? [p] : [];
    });

  it('no StyleSheet.create outside the theme (use themed())', () => {
    const offenders = [...files('src'), ...files('app')].filter(
      (f) => !f.includes(join('src', 'theme')) && readFileSync(f, 'utf8').includes('StyleSheet.create('),
    );
    expect(offenders).toEqual([]);
  });

  it('no direct colour imports from @xspeeria/tokens in app code', () => {
    const offenders = [...files('src'), ...files('app')].filter(
      (f) => !f.includes(join('src', 'theme')) && /from '@xspeeria\/tokens'/.test(readFileSync(f, 'utf8')),
    );
    expect(offenders).toEqual([]);
  });

  it('every route subscribes to the mode', () => {
    const offenders = files('app').filter((f) => !readFileSync(f, 'utf8').includes('useThemeMode()'));
    expect(offenders).toEqual([]);
  });
});
