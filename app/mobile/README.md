# Mobile App (Expo)

Companion application for iOS and Android built on Expo SDK 51 / React Native 0.81.

## Prerequisites

- Node.js ≥ 20.13 (Expo warns for < 20.19; upgrade if possible)
- npm v10+
- Expo CLI (optional but convenient):
  ```bash
  npm install -g expo-cli
  ```
- Access to the shared Supabase project (URL + anon key)
- App Store bundle identifier: `com.igrowtoday.igrowtoday`

## Setup

Install dependencies from the repository root (recommended) so the workspace lockfile stays in sync:
```bash
npm install
```

Alternatively, within the mobile workspace:
```bash
cd app/mobile
npm install
```

Create your environment file:
```bash
cp app/mobile/.env.example app/mobile/.env
```
Populate it with:
```
EXPO_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR-ANON-KEY
```

## Development workflow

Launch the Expo bundler:
```bash
npm run start:mobile        # from repo root
# or inside app/mobile
npm run start
```
Expo DevTools opens in the browser. From there you can run:
- **iOS simulator**: press `i` or click “Run on iOS simulator”
- **Android emulator**: press `a`
- **Expo Go on device**: scan the QR code

Hot reload is enabled by default. Journal entry auto-reflection mirrors the web experience as long as Supabase creds are present.

## Linting

```bash
npm run lint:mobile
```

## Troubleshooting

- **“getPreset is not a function” / bundler errors**: Ensure `app/mobile/babel.config.js` points to `babel-preset-expo` (already committed) and run `npm install --save-dev babel-preset-expo` if dependencies look stale.
- **Engine warnings (`EBADENGINE`)**: Expo SDK 51 targets Node ≥ 20.19. Upgrading your local Node version clears the warnings, though development still works on 20.13.
- **Supabase errors**: Confirm `.env` values and that the Supabase instance has the expected tables/RLS (see `supabase/README.md`).

## Building

- **Expo Go/OTA**: `expo publish`
- **Native binaries**: use EAS Build (`eas build --platform ios` / `android`)

Before building for production, audit environment variables (service role keys must *not* ship to the client) and confirm edge functions are deployed (`supabase functions deploy generate-reflection`).

## Useful scripts

| Command | Description |
| --- | --- |
| `npm run start:mobile` | Expo dev server (Metro) |
| `npm run start:mobile -- --android` | Force Android virtual device |
| `npm run start:mobile -- --ios` | Run on iOS simulator |
| `npm run lint:mobile` | ESLint check |
| `npm run test:web:e2e` | Web smoke tests (helps ensure Supabase backend is ready before mobile QA) |

For additional backend and deployment information, consult the root [`README.md`](../../README.md) and [`supabase/README.md`](../../supabase/README.md).
