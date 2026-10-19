# Run the App Against the Real Server (on your computer and phone)

For development only (ADR-027). The phone and the computer must be on the same Wi-Fi.

## 1. Start the database

```bash
docker compose up -d postgres
```

## 2. Create `.env` in the project folder

Copy `.env.example` to `.env`, then set:

```bash
APP_ENV=local
DATABASE_URL=postgresql+asyncpg://xspeeria_dev:xspeeria_dev_local_only@127.0.0.1:5432/xspeeria_dev
DEV_SMS=true
# Offers need an ID check; no ID-check provider exists yet. On your own computer only:
KYC_DEV_BYPASS=true
# Payout accounts: a pretend bank check (this computer only) and a key for account numbers.
BANK_CHECK_DEV=true
# Escrow steps with a pretend bank (this computer only; no real money moves):
PRETEND_BANK=true
```

Generate the three keys and paste them in (never share or commit them):

```bash
python -c "import secrets;print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))"
python -c "import base64,os;print('MFA_ENCRYPTION_KEY=' + base64.b64encode(os.urandom(32)).decode())"
python -c "import base64,os;print('BENEFICIARY_ENCRYPTION_KEY=' + base64.b64encode(os.urandom(32)).decode())"
```

## 3. Create the tables and start the server

```bash
uv sync
uv run alembic upgrade head
(cd backend && uv run python -m app.cli.currency_definitions)   # adds NGN, USD, GBP, EUR once
(cd backend && APP_ENV=local uv run python -m app.cli.pretend_bank)   # adds the pretend banks once
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`--host 0.0.0.0` lets your phone reach the server on your home network. Do not do this on
public Wi-Fi. Find your computer's address (for example `192.168.1.20`): `ipconfig` on
Windows, `ipconfig getifaddr en0` on a Mac.

## 4. Start the app pointed at the server

```bash
cd mobile
npm install
EXPO_PUBLIC_API_URL=http://192.168.1.20:8000 npx expo start -c
```

On Windows PowerShell: `$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:8000"; npx expo start -c`

Open it in Expo Go. The log-in screen says "Development build connected to …".

## 5. Sign up

1. Tap **Open a free profile**, enter your phone number and accept the consents.
2. Enter your email, then create and confirm a 6-digit PIN.
3. The SMS code appears in the **server window** as `[DEV SMS — local only] code for ***1234: 123456`.
4. Scan the QR code with Google Authenticator, Microsoft Authenticator or Authy, and enter its code.
5. Save the 10 recovery codes somewhere safe, then tap **Proceed to Home**.

Your phone is now trusted for 30 days: logging in needs only the PIN. On another phone the app
asks for the authenticator code.

## 6. Try the Market (offers)

Needs `KYC_DEV_BYPASS=true` in `.env` and the currency command from step 3.

1. **Market › Sell**: enter an amount in USD (at least 10) and a rate no higher than the
   official rate, then tap **Create Offer**. The app says your offer is live.
2. **Market › Buy › USD**: your offer is listed as "Your offer". Offers from other accounts
   show without any name.
3. **⋮ › My Offers**: see your offers and **Withdraw** one (tap twice).

4. **Take an offer** (needs a second account, e.g. on another phone): **Market › Buy › USD**,
   tap **Buy** on the other account's offer, enter an amount and your authenticator code, then
   **Take offer**. The deal is recorded at that rate.

5. **Choose payout accounts** (both accounts): **⋮ › My Deals › Choose payout account**. Add an
   account if you have none (your authenticator code confirms it), set how much each account
   gets, and confirm with a code. Both sides have 30 minutes.

6. **Pay into escrow** (needs `PRETEND_BANK=true` and the pretend-bank command from step 3):
   **My Deals › Escrow steps**. Each side sees the amount + 1% fee and the pretend bank's
   escrow details, with 5 minutes to pay. Tap **Simulate my transfer** on each phone. When both
   have paid, the pretend bank pays out at once and the deal says **Done**. If only one side
   pays, that side is refunded in full, fee included.

7. **Verify your identity** (needs a Didit account; see ADR-039): **Profile › KYC and limits ›
   Verify my identity** opens Didit's secure check. Without Didit keys the button says it isn't
   available, and `KYC_DEV_BYPASS=true` keeps the Market usable on your computer.

Buy requests are not built yet; the app says "coming soon". The pretend bank only exists on
your computer and forgets everything when the server restarts. No real money moves.

