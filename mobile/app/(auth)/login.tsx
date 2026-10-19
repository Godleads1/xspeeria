import type { ReactElement } from "react";
import { useRouter } from "expo-router";

import { LoginScreen } from "../../src/features/auth/LoginScreen";
import { SERVER_MODE } from "../../src/api/config";
import { serverAuth } from "../../src/features/auth/serverAuth";
import { session } from "../../src/features/auth/session";
import { kycRegions } from "../../src/features/profile/kycRegions";
import { useThemeMode } from "../../src/theme";

/** On success the root guard swaps to the signed-in app. */
export default function LoginRoute(): ReactElement {
  useThemeMode(); // repaint on light/dark change (ADR-010)
  const router = useRouter();
  return (
    <LoginScreen
      onDone={() =>
        // A log-in from a region without KYC offers a profile for that region (ADR-016).
        router.replace(
          session.get().newRegion === "US" && !kycRegions.has("USD")
            ? "/region/new"
            : "/",
        )
      }
      onSignUp={() => router.push("/signup/start")}
      onForgot={() => router.push("/forgot")}
      server={SERVER_MODE ? { login: serverAuth.login, unlock: (n) => serverAuth.unlock(n) } : null}
      onSecondFactor={(step) =>
        router.push(step === "mfa" ? "/mfa" : "/signup/authenticator")
      }
    />
  );
}
