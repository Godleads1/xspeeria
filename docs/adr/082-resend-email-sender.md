# ADR-082 — Email Through Resend (Off Until Set Up)

| Attribute | Value |
|---|---|
| **Status** | **IMPLEMENTED** — 2026-11-02 (switched off until the owner adds the settings) |
| **Decision ID** | DEC-089 |
| **Authority** | ADR-044 (owner, 2026-10-19): email provider **Resend**. Owner, 2026-11-02: *"go"* on item 3, *"Build the Resend email sender now, switched off until the account exists."* Readiness blocker C-5. |

## Decisions

1. **`ResendEmailSender`** (`backend/app/providers/email.py`) sends the three kinds of email the app already sends:
   - sign-in and confirmation **codes** to customers and staff;
   - **"was this you?" alerts** to customers;
   - **operations alerts** to Super Admins (ADR-074).
2. **It is on only when both `RESEND_API_KEY` and `EMAIL_FROM` are set.**
   - With one but not the other, the server refuses to start.
   - `DEV_EMAIL` (print to the window, local only) and Resend can't both be set.
   - With neither, nothing changes: the routes that need email answer "not available", as today.
3. **Request format**, as documented by Resend:
   - `POST https://api.resend.com/emails`, with `Authorization: Bearer <key>`;
   - a JSON body with `from`, `to`, `subject` and `text`;
   - an `Idempotency-Key` header, 1–256 characters, which Resend keeps for 24 hours.
   - Sources: [Resend: idempotency keys](https://resend.com/docs/dashboard/emails/idempotency-keys.md), [Resend: send email](https://www.resend.com/docs/api-reference/emails/send-email-with-topic).
4. **One retry, never a duplicate.** After a network error or a 5xx, the message is sent once more with the **same** idempotency key, so Resend can't deliver it twice. Each message gets a new random key, so a genuine second alert is never mistaken for a repeat. A 4xx is not retried.
5. **Plain text only, with no links,** so a phishing email can't copy a "click here" from ours. The messages say staff never ask for codes.
6. **Nothing about a message is logged:** not the address, not the code, not the key. A failure raises `EmailDeliveryError` with the HTTP status only. Calls appear on System Health as "Resend email" (ADR-072).

## To switch it on (owner)

1. Create a Resend account. Add a sending domain, such as `mail.<your-domain>`, and put the DNS records Resend gives into the domain's DNS. Wait until Resend shows it **verified**.
2. Create an API key with **sending access only**.
3. In the server's secret settings (never in Git or chat):
   - `RESEND_API_KEY=<the key>`;
   - `EMAIL_FROM=Xspeeria <no-reply@mail.<your-domain>>`.
4. Restart the server and test a staff sign-in. The code should arrive by email, and System Health shows the Resend call.

## Consequences

- Email content leaves Xspeeria to Resend, a US company. It contains codes, alert titles and the recipient's address, but no amounts or account numbers. Whether this needs a data-processing agreement, or is a cross-border transfer under Nigeria's NDPA, is a question for the lawyer. **`UNKNOWN — NOT VERIFIED`.**
- Not tested against the real Resend service, because there is no account yet. The request format comes from Resend's documentation, and the tests check it against a fake service.

## Evidence

`backend/tests/unit/test_resend_email.py` (10 tests):

- the request: URL, bearer key, idempotency key, plain-text body with no links;
- a retry after a 5xx reuses the key;
- two real alerts get two keys;
- a network failure is retried once;
- failures name no address, code or key, and 4xx is not retried;
- the server chooses the sender from the settings, and refuses half-configured settings.
