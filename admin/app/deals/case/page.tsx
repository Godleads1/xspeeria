'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, type ReactElement } from 'react';

import { SignedIn } from '../../../components/SignedIn';
import { DealTimelineScreen } from '../../../components/screens/DealTimelineScreen';
import { ErrorState } from '../../../components/primitives';
import { tr } from '../../../lib/i18n';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The id comes from the address bar: untrusted, checked before it is used. */
function Deal(): ReactElement {
  const id = useSearchParams().get('id') ?? '';
  return UUID.test(id) ? <DealTimelineScreen id={id} /> : <ErrorState title={tr('That deal was not found.')} />;
}

export default function Page(): ReactElement {
  return (
    <SignedIn current="/deals">
      <Suspense>
        <Deal />
      </Suspense>
    </SignedIn>
  );
}
