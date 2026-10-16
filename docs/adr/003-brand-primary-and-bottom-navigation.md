# ADR-003 — Application Brand Primary and Mobile Bottom Navigation

| Attribute | Value |
|---|---|
| **Status** | **APPROVED** |
| **Date** | 2026-10-16 |
| **Decision IDs** | DEC-005 (bottom navigation) · DEC-006 (brand primary) |
| **Supersedes** | Application primary `#1F3A8A` and its interaction ladder (`PRODUCT.md` Brand Commitments (B); `docs/09-ui-ux/DESIGN_SYSTEM.md`; `docs/13-governance/CORRECTIONS_v3.md` §9.1). Bottom-navigation labels `Marketplace` / `Track` (`mobile/src/navigation/tabs.ts`, approved 2026-08-22) |
| **Authority** | Human decision by the product owner, 2026-10-16 — `DOCUMENT_INDEX.md` §1 rank 2 |

---

## 1. Decisions

1. **DEC-006 — Brand primary is the logo navy `#001A6E`.** Source: the vector logo `Asset_6.svg` (navy
   `#001A6E`, red `#F80B09`, yellow `#FFB700`, green `#208B3A`). Only the navy becomes an
   application token; the other logo colours remain brand-asset values, not UI tokens.
2. **DEC-005 — Bottom navigation is `Home · Market · History · Cards · Profile`.** `Cards` stays
   COMING SOON. Notifications remain off the bottom navigation.
3. **The Figma mobile design (file `5ayAjPFxxHmEQIrEjauHTB`, page `1:2`) is followed
   strictly**, including the Satoshi font and the card screens on mock data. Permitted
   deviations: the navigation above, corrected typos/placeholders, and auth/KYC/money flows
   running on mock data only.

## 2. Evidence

- The Figma mobile screens paint the active navigation item in exactly `#001A6E`
  (measured from Figma renders of nodes `51:1799` and `79:461`, 2026-10-16). The earlier
  `#1F3A8A` was read from the Figma *Design System* swatch page, which disagrees with the
  screens themselves. The screens now govern.
- Figma navigation bar surface: `#F8F9FD` (`color.bg.sunken`).

## 3. Consequences

| Token | Before | After | Contrast on `#FFFFFF` |
|---|---|---|---|
| `color.brand.primary` / `interaction.primary.default` | `#1F3A8A` | `#001A6E` | 15.30:1; white on it 15.30:1 |
| `interaction.primary.hover` | `#1E40AF` | `#002885` | 12.79:1 |
| `interaction.primary.pressed` | `#172554` | `#001350` | 17.37:1 |
| `interaction.primary.focus` | `#1D4ED8` | unchanged | 6.70:1 (2px canvas offset) |

- `#172554` cannot remain the pressed state: it is *lighter* than `#001A6E` (1.04:1 apart),
  so a press would show no feedback. `#002885` / `#001350` are the hover/pressed pair
  originally designed for this navy, previously listed as superseded; they are reinstated.
- `#001B68` (the pre-Figma primary) stays superseded; it is a different value.
- Navigation icons move to `react-native-svg`: outline when inactive, solid when active, as
  in Figma. The vectors are redrawn against the Figma renders because the file could not be
  exported (no edit access). **Open:** replace with exported Figma vectors.
- `track` route renamed to `history`. The `marketplace` route path is unchanged; only its
  tab label is `Market`.

## 4. Recorded deviation — `UNKNOWN — NOT VERIFIED` with design

Figma paints inactive tabs in `#9CA3AF` (`text.disabled`), which measures 2.41:1 on the
`#F8F9FD` bar and fails WCAG 1.4.11 (3:1) for icons. The implementation keeps
`text.secondary` `#4B5563` for inactive tabs. Needs a design decision.
