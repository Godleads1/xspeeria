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
```

Generate the two keys and paste them in (never share or commit them):

```bash
python -c "import secrets;print('JWT_SECRET_KEY=' + secrets.token_urlsafe(48))"
python -c "import base64,os;print('MFA_ENCRYPTION_KEY=' + base64.b64encode(os.urandom(32)).decode())"
```

## 3. Create the tables and start the server

```bash
uv sync
uv run alembic upgrade head
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
