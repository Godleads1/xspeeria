/**
 * A translated sentence with styled parts (ADR-053). Mark the parts with numbered tags so a
 * translator can move them: `"Transfer <1>{{amount}}</1> to"`. Each tag number maps to a
 * function that renders that part. Untagged text stays plain. Tags never nest.
 */

import { Fragment, type ReactElement, type ReactNode } from 'react';

import { tr } from './index';

export function trRich(
  key: string,
  values: Record<string, unknown>,
  parts: Record<number, (text: string) => ReactNode>,
): ReactElement {
  const text = tr(key, values);
  const out: ReactNode[] = [];
  const re = /<(\d+)>(.*?)<\/\1>/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const render = parts[Number(m[1])];
    out.push(render ? render(m[2]) : m[2]);
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <>
      {out.map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
}
