/**
 * Balance regression guard.
 *
 * Xspeeria has no wallet and no stored customer balance. This scans customer-facing
 * mobile source for the specific copy and affordances that reintroduce that concept.
 *
 * It deliberately does NOT block the word "balance" outright: legitimate technical uses
 * exist elsewhere (accounting reconciliation, balanced double-entry). The guard is
 * scoped to mobile product source and to phrases that assert a customer balance.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const MOBILE_ROOT = join(__dirname, '..');
const SCANNED_DIRS = ['app', 'src'];
const SCANNED_EXTENSIONS = ['.ts', '.tsx'];

/** Phrases that assert a customer balance or a wallet affordance. */
const PROHIBITED: readonly { pattern: RegExp; why: string }[] = [
  { pattern: /available\s+balance/i, why: 'Xspeeria has no available balance' },
  { pattern: /hide\s+balance/i, why: 'there is no balance to hide' },
  { pattern: /show\s+balance/i, why: 'there is no balance to show' },
  { pattern: /use\s+all\s+available/i, why: 'implies a spendable stored balance' },
  { pattern: /wallet\s+balance/i, why: 'Xspeeria is wallet-less' },
  { pattern: /stored\s+balance/i, why: 'Xspeeria never stores customer funds' },
  { pattern: /account\s+balance/i, why: 'Xspeeria holds no customer account balance' },
  { pattern: /current\s+balance/i, why: 'Xspeeria holds no customer balance' },
  { pattern: /total\s+balance/i, why: 'an aggregate balance is the forbidden affordance' },
  { pattern: /withdrawable/i, why: 'nothing is withdrawable: Xspeeria is non-custodial' },
  { pattern: /\btop\s?-?up\b/i, why: 'implies funding a stored balance' },
  { pattern: /wallet\s+id/i, why: 'no wallet identifier may be displayed' },
];

function collectSourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectSourceFiles(full, found);
    } else if (SCANNED_EXTENSIONS.some((ext) => full.endsWith(ext))) {
      found.push(full);
    }
  }
  return found;
}

const sourceFiles = SCANNED_DIRS.flatMap((dir) => collectSourceFiles(join(MOBILE_ROOT, dir)));

describe('no-wallet / no-stored-balance product rule', () => {
  it('finds mobile source to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(0);
  });

  it.each(PROHIBITED)('never uses $pattern ($why)', ({ pattern }) => {
    const offenders: string[] = [];
    for (const file of sourceFiles) {
      const contents = readFileSync(file, 'utf8');
      // Skip this guard's own vocabulary if it is ever colocated under src.
      if (file.endsWith('no-balance.test.ts')) continue;
      for (const [index, line] of contents.split('\n').entries()) {
        // Allow explicit negations: copy that says Xspeeria has NO balance is correct.
        const isNegation = /\bno\b[^.]{0,40}balance|never[^.]{0,40}balance/i.test(line);
        if (pattern.test(line) && !isNegation) {
          offenders.push(`${relative(MOBILE_ROOT, file)}:${index + 1}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('renders no currency hero outside the Amount primitive', () => {
    // Amount is the single component permitted to render a currency value, which keeps
    // the tabular-figure rule and the no-aggregate rule enforceable in one place.
    const currencyRenderers = sourceFiles.filter((file) => {
      if (file.includes(join('components', 'primitives'))) return false;
      return /toLocaleString|Intl\.NumberFormat|toFixed\(/.test(readFileSync(file, 'utf8'));
    });
    expect(currencyRenderers.map((f) => relative(MOBILE_ROOT, f))).toEqual([]);
  });
});
