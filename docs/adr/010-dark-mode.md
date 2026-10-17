# ADR-010 — Dark Mode

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-17 |
| **Decision ID** | DEC-016 |
| **Authority** | Product owner, 2026-10-17: "activate the switch mode button to enable darkmode for all screen built already or that will be built later" — `DOCUMENT_INDEX.md` §1 rank 2 |
| **Amends** | `UI_UX_SCREEN_SPEC.md` / Product Design Spec "Light Mode" canvas reference: light stays the default and the Figma reference; dark is an added scheme. Supersedes ADR-007's "Switch shown disabled" deviation. |

## 1. Decision

- Profile → **Switch Mode** toggles the whole app between light (default) and dark.
  The choice is saved on the device (`AsyncStorage`, key `xspeeria.themeMode`) and restored
  before the splash screen hides. Native alerts and the keyboard follow via
  `Appearance.setColorScheme`.
- **Tokens:** `colorDark` and `interactionDark` in `@xspeeria/tokens` have exactly the same
  roles as light (asserted by test). A deep navy-black family keeps dark surfaces on-brand.
- **New role `brand.fill`** for filled brand surfaces under white text (avatars, FAB,
  selected day, chat bubble, checkbox). It equals `brand.primary` in light, so light is
  unchanged. In dark they split: `brand.primary` `#8EA2FF` is readable text on the dark
  canvas, `brand.fill` `#2F4BD1` keeps white text readable. No single blue can do both.
- Contrast (tested): dark text roles ≥ 4.5:1 on canvas and sunken; white ≥ 4.5:1 on dark
  fills; Sell label ≥ 3:1 (19 pt bold); control borders ≥ 3:1. Decorative colours, flags,
  illustrations and the QR code's white background are unchanged.

## 2. How screens support it (now and later)

- Styles: `themed(() => ({ ... }))` from `src/theme` instead of `StyleSheet.create`. The
  factory runs once per mode with the live `color`.
- Colours: always the live `color` / `interaction` from `src/theme`, read during render —
  never captured in a module-level constant (use a function instead).
- Routes: every file in `app/` calls `useThemeMode()` so the screen repaints on change.
- `__tests__/theme-mode.test.tsx` fails the build if any file uses `StyleSheet.create`,
  imports colours straight from `@xspeeria/tokens`, or a route forgets `useThemeMode()`.

## 3. Verification

All screens were rendered in dark through a web export and checked by eye on
2026-10-17 (Home, Market, History, receipt, Profile and every Profile sub-screen); light
screenshots matched the previous look. Web packages were installed for the check only
and are not part of the project.

## 4. Open

- "Follow the phone's setting" (system) as a third option is not built.
- Figma has no dark frames; dark values are ours and may be refined by the designer.
