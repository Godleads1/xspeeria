# Test Xspeeria From Start to Finish (on your own computer)

Owner request, 2026-10-27: demo customers and staff, demo escrow, a test advert, and how to run the admin console and the app together.

**Everything here is pretend and works only on your computer** (`APP_ENV=local`):
- the people are demo people;
- the escrow bank is a pretend bank;
- no real money, SMS, email or identity provider is used.

The server refuses every demo switch anywhere else.

## What you get

**Demo customers.** The PIN for all of them is **482613**.

| Who | Sign in with | Verified in | Bank accounts | Has a live offer |
|---|---|---|---|---|
| **Ada Obi — you** | `ada.demo@example.com` or +234 803 000 0001 | Nigeria | NGN, USD, GBP | None (make your own) |
| Ben Carter — **robot** | `ben.demo@example.com` or +44 7700 900001 | UK and Nigeria | GBP, NGN | Sells £200 for naira at 1,750 |
| Chloe Adams — **robot** | `chloe.demo@example.com` or +1 202 555 0101 | United States | USD, NGN | Sells $300 for naira at 1,320 |
| Dan — you | `dan.demo@example.com` or +234 803 000 0004 | Not yet | None | — |

**You play Ada (or Dan). The server plays Ben and Chloe**, like playing FIFA against the computer. With `DEMO_AUTOPILOT=true`, every few seconds the robots:
- **take your offers** they can pay for, after a short pause (Chloe pays dollars, Ben pays pounds);
- **choose their bank account** on any deal with you;
- **pay their side into the pretend escrow** by themselves;
- **post their offer again** once you've taken it all, so the Market never runs dry.

You only do your own side. You'll see each step arrive on your screen and in your notifications. The robots follow the same rules as people; the one shortcut is that they don't do a face check, since nobody holds a robot's phone.

**Demo staff** for the admin console. The password for all of them is **`Xspeeria demo 2026!`**.

| Email | Role |
|---|---|
| `boss.demo@example.com` | Super Admin |
| `compliance.demo@example.com` | Compliance Officer |
| `ops.demo@example.com` | Ops Admin |
| `support.demo@example.com` | Support Agent |

**Pretend escrow banks:** Nigeria, UK and US. A deal's escrow opens at the pretend bank, and you press **Simulate my transfer** instead of really paying.

**Test advert pictures** (sent to you in the chat): `xspeeria-test-advert-1.png` and `xspeeria-test-advert-2.jpg`. They are exactly the app's advert shape (1026 × 339), clearly marked "TEST ADVERT".

## Part 1 — one-time setup

Open **PowerShell** in your project folder (`C:\Users\HomePC\Documents\xspeeria`).

### 1. Get the latest code and packages

```powershell
git pull
npm install
uv sync
```

### 2. Check your `.env` file

Open `.env` in the project folder (VS Code is fine). Make sure each of these lines is there **with these values**. Change a line if it's already there, or add it if it isn't. **Don't paste your `.env` into the chat.**

```
APP_ENV=local
DEV_SMS=true
DEV_EMAIL=true
FACE_CHECK_DEV=true
BANK_CHECK_DEV=true
PRETEND_BANK=true
TEST_LIMITS_DEV=true
DEMO_AUTOPILOT=true
LOCAL_PHOTO_DIR=.local-photos
CORS_ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
KYC_DEV_BYPASS=false
```

You also need a payout-account key. If the line `BENEFICIARY_ENCRYPTION_KEY=` is **empty**, make one:

```powershell
python -c "import base64,os;print('BENEFICIARY_ENCRYPTION_KEY=' + base64.b64encode(os.urandom(32)).decode())"
```

Copy the line it prints into `.env`, replacing the empty one. If the line already has a value, leave it alone: changing it makes saved bank accounts unreadable.

What these switches do:
- `DEV_SMS` / `DEV_EMAIL`: sign-in codes appear in the **server window** instead of by text message or email.
- `FACE_CHECK_DEV`: the selfie check passes by itself, without a camera.
- `BANK_CHECK_DEV`: new bank accounts are accepted, under the name "DEV ACCOUNT HOLDER".
- `PRETEND_BANK`: the pretend escrow bank.
- `DEMO_AUTOPILOT`: Ben and Chloe trade back by themselves (the robots).
- `TEST_LIMITS_DEV`: lets you sign in and approve many times without hitting the safety limits (they're 20 times higher).
- `CORS_ALLOWED_ORIGINS`: lets the app's browser version talk to the server.
- `KYC_DEV_BYPASS=false`: Dan really is unverified, so you can see that experience.

### 3. Update the database and add the demo data

```powershell
uv run alembic upgrade head
cd backend
uv run python -m app.cli.seed_demo
cd ..
```

The last command lists what it created and ends with the demo PIN and password. It's safe to run again: anything already there is left alone.

## Part 2 — start everything (every time)

You need **three PowerShell windows**, all opened in `C:\Users\HomePC\Documents\xspeeria`. Keep them open while you test.

### Window 1 — the server

```powershell
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Leave it running. **Sign-in codes appear here**, like `[DEV SMS — local only] code for ***0001: 123456` or `code for a***@example.com: 123456`.

If Windows asks whether to allow access on your network, choose **Private networks** only.

### Window 2 — the admin console

```powershell
cd admin
npm run dev
```

Open **http://localhost:3000** in your browser.

### Window 3 — the app

First find your computer's address: run `ipconfig` and look for **IPv4 Address**, for example `192.168.1.20`. Then:

```powershell
cd mobile
$env:EXPO_PUBLIC_API_URL="http://192.168.1.20:8000"
npx expo start -c
```

Use **your** address in place of `192.168.1.20`. Then choose:

- **On your phone:** install **Expo Go** from the Play Store or App Store. Your phone must be on the **same Wi-Fi** as the computer. Scan the QR code in Window 3.
- **In a browser on the computer:** press **w** in Window 3. The app opens at `http://localhost:8081`.
  - In the browser, set `$env:EXPO_PUBLIC_API_URL="http://localhost:8000"` instead before `npx expo start -c`.
  - Reloading the browser page signs you out. That's normal for the browser version: just sign in again.

You only need **one** sign-in (Ada); the robots are the other side. To watch a robot's side too, sign in as Ben or Chloe in a second browser window, but don't press their buttons.

## Part 3 — a full test, step by step

### A. Sign in as a customer

1. Open the app, tap **I have a profile**, choose the **Email** tab, and enter `ada.demo@example.com` and PIN `482613`.
2. **Confirm it's you with a selfie** appears, because this is a new phone for the account. Tap **Start face check**; it passes by itself.
3. Home shows **Ada Obi** and today's best rates from the demo offers.

### B. A complete deal with a robot (you are Ada)

**Taking a robot's offer:**
1. Market › Buy › choose **USD**. Chloe's offer is listed. Tap **Buy**, enter an amount (for example 50), approve with the face check, and **Take offer**.
2. Within about 15 seconds Chloe chooses her bank account by herself.
3. Market › **⋮ › My Deals** › **Choose payout account**: pick your **USD** account and approve.
4. **My Deals › Escrow steps** shows your amount + 1% fee and the pretend bank's details. Tap **Simulate my transfer** within **5 minutes**.
5. Chloe pays her side by herself. The pretend bank pays out and the deal shows **Completed**.

**Letting a robot take your offer:**
1. Market › **Sell**: offer naira for **USD** (Chloe will take it) or for **GBP** (Ben will take it), at a rate no higher than the official rate.
2. Within about 15 seconds a robot takes all of it. You get a notification and it appears in **My Deals**.
3. Choose your payout account, then **Simulate my transfer**, as above. The robot does its side.

If you don't pay within 5 minutes, the deal is cancelled. A side that already paid gets everything back, fee included; you can test that too.

### C. Things to try in the app

- **Make your own offer:** Market › Sell.
- **Report a problem with a deal:** from the deal's escrow screen. It appears in the console under **Dispute Resolution**.
- **Choose a country to verify:** sign in as **Dan**, then Profile › KYC and limits › **Verify your identity**. Without a Didit account the check itself says it isn't available; that's expected.
- **Add a bank account:** Profile › **Manage Beneficiaries** (payout accounts). Its name will be "DEV ACCOUNT HOLDER", so within about a minute the console's **Fraud Management** shows a "payout account in another name" alert. That's a good way to test fraud alerts.

### D. The admin console

Sign in at **http://localhost:3000**. Use a staff email and `Xspeeria demo 2026!`, then the code from **Window 1**.

| Try this | As |
|---|---|
| **Users**: the four demo customers; suspend and reactivate Dan | Super Admin |
| **Dispute Resolution**: answer the problem you reported in C | Support Agent or Super Admin |
| **Reversal**: on a dispute, **Process Refund** asks; a *different* staff member approves | Ops Admin + Super Admin |
| **Fraud Management**: the alert from C | Compliance Officer |
| **Service Outage Mgt**: post a notice; it appears on the app's Home | Super Admin or Ops Admin |
| **Setups › Adverts**: upload the test advert pictures; they appear on the app's Market | Super Admin |
| **The bell** (top right): new work waiting for that person | Any |
| **Identity checks**: empty until a check is held. Holding needs the real Didit, so this one can't be fully tested yet | — |

## Starting over

To delete every customer and everything they did, then add the demo people again:

```powershell
cd backend
uv run python -m app.cli.reset_local_data --yes-delete-everything
uv run python -m app.cli.seed_demo
```

Staff accounts and adverts are kept.

## If something goes wrong

| What you see | What to do |
|---|---|
| "Too many attempts" | Check `TEST_LIMITS_DEV=true` in `.env`, then restart Window 1 |
| The app can't reach the server | Check the address in `EXPO_PUBLIC_API_URL`, that the phone is on the same Wi-Fi, and that Window 1 is running |
| No code appears | Look in **Window 1** (not the app). `DEV_SMS` and `DEV_EMAIL` must be `true` |
| "Payout accounts are not available" | `BENEFICIARY_ENCRYPTION_KEY` is missing in `.env` |
| The deal never opens escrow | `PRETEND_BANK=true`, and run `seed_demo` again (it adds the pretend banks) |
| Anything else | Copy the last lines of Window 1 into the chat; they never contain your keys |
