import type { ReactElement } from 'react';
import { useRouter } from 'expo-router';

import { SERVER_MODE } from '../../../src/api/config';
import { ChangeDobScreen } from '../../../src/features/profile/ChangeDobScreen';
import { NotEditableHere } from '../../../src/features/profile/ServerChangePhoneScreen';
import { useThemeMode } from '../../../src/theme';
import { tr } from "../../../src/i18n";

export default function ChangeDobRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  if (SERVER_MODE) {
    return (
      <NotEditableHere
        title={tr("Date of birth")}
        body={tr("Your date of birth comes from your verified ID and cannot be changed here. If it is wrong, contact Support.")}
        onBack={() => router.back()}
      />
    );
  }
  return <ChangeDobScreen onBack={() => router.back()} onDone={() => router.back()} />;
}
