'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { SignedIn } from '../../../components/SignedIn';
import { ReversalScreen } from '../../../components/screens/ReversalScreen';
import { ErrorState } from '../../../components/primitives';
import { tr } from '../../../lib/i18n';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id comes from the address bar: untrusted, checked before it is used. */
function Case(): ReactElement {
  const id = useSearchParams().get('id') ?? '';
  return UUID.test(id) ? <ReversalScreen id={id} /> : <ErrorState title={tr('That reversal was not found.')} />;
}

export default function Page(): ReactElement {
  return (
    <SignedIn current="/reversals">
      <Suspense>
        <Case />
      </Suspense>
    </SignedIn>
  );
}
