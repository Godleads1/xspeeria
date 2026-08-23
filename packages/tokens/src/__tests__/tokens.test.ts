import { describe, expect, it } from 'vitest';

import { color, font, interaction, radius, space, tokens } from '../index';
import * as entryPoint from '../index';

/**
 * Contrast, computed rather than asserted from memory. WCAG 2.1 relative luminance.
 */
function luminance(hex: string): number {
  const value = hex.replace('#', '').slice(0, 6);
  const channels = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const linear = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** Values the design system explicitly superseded. None may reappear. */
const DEPRECATED = [
  '#001B68', // old primary
  '#179A43', // old success
  '#E52421', // old alert
  '#F8FAFC', // old supporting surface
  '#002885', // old hover
  '#001350', // old pressed
  '#F3F4F6', // old subtle border value (now the disabled fill only)
  '#001A6E',
  '#208B3B',
  '#F90A09',
  '#FEB700',
];

describe('semantic token presence', () => {
  it('exposes every approved semantic group', () => {
    expect(Object.keys(tokens).sort()).toEqual(
      ['color', 'font', 'interaction', 'radius', 'space'].sort(),
    );
  });

  it('exposes the approved colour roles', () => {
    expect(Object.keys(color).sort()).toEqual(
      ['bg', 'border', 'brand', 'error', 'success', 'text', 'warning'].sort(),
    );
    expect(Object.keys(color.bg).sort()).toEqual(['canvas', 'overlay', 'sunken']);
    expect(Object.keys(color.text).sort()).toEqual(
      ['disabled', 'onFill', 'primary', 'secondary'].sort(),
    );
    expect(Object.keys(color.border).sort()).toEqual(['focus', 'strong', 'subtle']);
  });

  it('splits every status family into fill, surface, border and text', () => {
    for (const family of [color.success, color.warning, color.error]) {
      expect(Object.keys(family).sort()).toEqual(['border', 'fill', 'surface', 'text']);
    }
  });

  it('exposes the full primary interaction ladder', () => {
    expect(Object.keys(interaction.primary).sort()).toEqual(
      ['default', 'disabledFill', 'disabledLabel', 'focus', 'hover', 'pressed'].sort(),
    );
  });

  it('exposes spacing and radius scales', () => {
    expect(space).toEqual({ xs: 8, sm: 16, md: 24, lg: 32 });
    expect(radius).toEqual({ md: 16, lg: 24, xl: 32 });
  });
});

describe('approved token values', () => {
  it('keeps the approved brand primary exactly', () => {
    // Deliberately NOT normalised to the framework default #1E3A8A.
    expect(color.brand.primary).toBe('#1F3A8A');
    expect(interaction.primary.default).toBe('#1F3A8A');
  });

  it('keeps the approved surfaces, text and borders', () => {
    expect(color.bg.canvas).toBe('#FFFFFF');
    expect(color.bg.sunken).toBe('#F8F9FD');
    expect(color.text.primary).toBe('#111827');
    expect(color.text.secondary).toBe('#4B5563');
    expect(color.text.disabled).toBe('#9CA3AF');
    expect(color.border.subtle).toBe('#E5E7EB');
    expect(color.border.strong).toBe('#6B7280');
    expect(color.border.focus).toBe('#1D4ED8');
  });

  it('keeps the approved status families', () => {
    expect(color.success).toEqual({
      fill: '#10B981',
      surface: '#ECFDF5',
      border: '#059669',
      text: '#047857',
    });
    expect(color.warning).toEqual({
      fill: '#F59E0B',
      surface: '#FFFBEB',
      border: '#D97706',
      text: '#B45309',
    });
    expect(color.error).toEqual({
      fill: '#EF4444',
      surface: '#FEF2F2',
      border: '#EF4444',
      text: '#B91C1C',
    });
  });

  it('keeps the approved interaction ladder', () => {
    expect(interaction.primary.hover).toBe('#1E40AF');
    expect(interaction.primary.pressed).toBe('#172554');
    expect(interaction.primary.focus).toBe('#1D4ED8');
  });
});

describe('no deprecated palette leakage', () => {
  const exported = JSON.stringify(tokens).toUpperCase();

  it.each(DEPRECATED.filter((hex) => hex !== '#F3F4F6'))(
    'does not export the superseded value %s',
    (hex) => {
      expect(exported).not.toContain(hex);
    },
  );

  it('uses #F3F4F6 only as the disabled fill', () => {
    const occurrences = exported.split('#F3F4F6').length - 1;
    expect(occurrences).toBe(1);
    expect(interaction.primary.disabledFill).toBe('#F3F4F6');
  });

  it('exports no accent/gold semantic token', () => {
    expect(exported).not.toContain('#F4C21F');
    expect(Object.keys(color)).not.toContain('accent');
    expect(Object.keys(color)).not.toContain('gold');
  });
});

describe('primitives are not publicly consumable', () => {
  it('does not re-export the raw palette or ramps from the entry point', () => {
    expect(entryPoint).not.toHaveProperty('palette');
    expect(entryPoint).not.toHaveProperty('scale');
    expect(entryPoint).not.toHaveProperty('radii');
  });
});

describe('contrast assumptions', () => {
  const canvas = color.bg.canvas;

  it('brand primary passes AA for normal text and for a white label on it', () => {
    expect(contrast(color.brand.primary, canvas)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.text.onFill, color.brand.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('text roles pass AA on the canvas', () => {
    expect(contrast(color.text.primary, canvas)).toBeGreaterThanOrEqual(7);
    expect(contrast(color.text.secondary, canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it('text roles still pass AA on the sunken surface', () => {
    expect(contrast(color.text.primary, color.bg.sunken)).toBeGreaterThanOrEqual(7);
    expect(contrast(color.text.secondary, color.bg.sunken)).toBeGreaterThanOrEqual(4.5);
  });

  it('the strong border clears the 3:1 non-text threshold and the subtle one does not', () => {
    expect(contrast(color.border.strong, canvas)).toBeGreaterThanOrEqual(3);
    // Documented and intentional: subtle is decorative and must never bound a control.
    expect(contrast(color.border.subtle, canvas)).toBeLessThan(3);
  });

  it('the focus ring clears 3:1 against the canvas', () => {
    expect(contrast(color.border.focus, canvas)).toBeGreaterThanOrEqual(3);
  });

  it('every status text variant passes AA on its own surface', () => {
    expect(contrast(color.success.text, color.success.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.warning.text, color.warning.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(color.error.text, color.error.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it('status fills are only safe under dark text, which is why fill != text', () => {
    for (const family of [color.success, color.warning, color.error]) {
      expect(contrast(color.text.primary, family.fill)).toBeGreaterThanOrEqual(4.5);
      // Each fill on its own would fail as normal-size text — hence the split.
      expect(contrast(family.fill, canvas)).toBeLessThan(4.5);
    }
  });

  it('secondaryText passes AA where brand.secondary does not', () => {
    expect(contrast(color.brand.secondary, canvas)).toBeLessThan(4.5);
    expect(contrast(color.brand.secondaryText, canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it('the disabled interaction label stays readable', () => {
    expect(
      contrast(interaction.primary.disabledLabel, interaction.primary.disabledFill),
    ).toBeGreaterThanOrEqual(4);
  });
});

describe('typography roles', () => {
  it('exposes brand and numeric roles only', () => {
    expect(Object.keys(font).sort()).toEqual(['brand', 'numeric']);
  });

  it('resolves brand to a system stack, with no Satoshi anywhere', () => {
    expect(font.brand.family).toBe('system');
    expect(JSON.stringify(font).toLowerCase()).not.toContain('satoshi');
  });

  it('carries the approved Inter numeric role with tabular figures', () => {
    expect(font.numeric.family).toBe('Inter');
    expect(font.numeric.tabular).toBe(true);
  });
});
