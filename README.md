# AI Journal Monorepo

A unified workspace for the AI journaling experience. The repository hosts a Next.js web companion, an Expo-powered mobile app, and Supabase functions that power authentication, persistence, and AI reflections.

## Project layout

```
/
├── app
│   ├── web                # Next.js 15 App Router project
│   └── mobile             # Expo (React Native) application
├── supabase               # Edge functions, migrations, and SQL helpers
├── tools/playwright-mcp   # Utility workspace for MCP Playwright automation
├── AGENTS.md              # Engineering guidelines for the team
└── README.md              # This file
```

## Prerequisites

| Tool | Notes |
| --- | --- |
| Node.js | ≥ 20.13 locally (Expo CLI warns and prefers ≥ 20.19). Use `nvm`/`asdf` to switch if needed. |
| npm | v10+ (bundled with recent Node). |
| Supabase CLI | Required for edge function deploys (`brew install supabase/tap/supabase`). |
| Expo CLI | `npm install -g expo-cli` (optional; `npm run start:mobile` wraps it). |
| Git + GitHub | Source control and Vercel deploy integration. |

## Getting started

1. **Install dependencies** (root command hydrates all workspaces):
   ```bash
   npm install
   ```
2. **Configure Supabase**:
   - Follow [`supabase/README.md`](supabase/README.md) to create the project, run migrations, and deploy the `generate-reflection` function.
3. **Copy environment files**:
   ```bash
   cp app/web/.env.local.example app/web/.env.local
   cp app/mobile/.env.example app/mobile/.env
   ```
   Populate each file with `SUPABASE_URL` and `SUPABASE_ANON_KEY` from the Supabase dashboard. Leave `NEXT_PUBLIC_SUPABASE_TEST_STUB` unset (or `0`) for production builds; set to `1` only when running local stub flows.

## Common npm scripts

_Run these from the repository root unless noted otherwise._

| Command | Description |
| --- | --- |
| `npm run dev:web` | Launch the Next.js development server on http://localhost:3000. |
| `npm run build:web` | Production build for the web app (`next build`). |
| `npm run test:web` | Unit tests (Jest). |
| `npm run test:web:e2e` | Playwright E2E suite (auto-starts the dev server on port 3100). |
| `npm run mcp:playwright` | Start the MCP Playwright server for tooling. |
| `npm run mcp:playwright:sample` | Boots the web app, connects via MCP, asserts the UI renders. |
| `npm run start:mobile` | Expo dev bundler (Metro). Use `--android`, `--ios`, or `--web` via the mobile workspace scripts. |
| `npm run lint:mobile` | ESLint check for the mobile project. |

## Running the apps

### Web (Next.js)

```bash
npm run dev:web   # http://localhost:3000
```
- Auto-generates AI reflections once journal text is entered.
- Uses Supabase RLS; ensure `.env.local` points at your Supabase instance.
- Deploy with Vercel. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel environment, then push to `main`.

### Mobile (Expo)

See [`app/mobile/README.md`](app/mobile/README.md) for detailed instructions. Quick start:
```bash
npm run start:mobile
```
Open the Expo DevTools, run on a simulator/device, and provide matching Supabase environment variables in `app/mobile/.env`.

## Supabase and edge functions

- Migrations live in `supabase/migrations/*`. Apply them via `supabase db push` or the SQL editor.
- The `generate-reflection` function returns `reflection` and `action` fields for both web and mobile clients. Deploy with:
  ```bash
  supabase functions deploy generate-reflection --project-ref <project-ref>
  ```
- Store secrets (e.g., `GEMINI_API_KEY`) using `supabase secrets set` rather than committing them.

## Testing & QA

- Unit/UI: `npm run test:web`
- Browser smoke: `npm run test:web:e2e -- --list`
- MCP tooling (optional interactive checks): `npm run mcp:playwright`
- Supabase Edge functions: `supabase functions serve generate-reflection`

## Deployment notes

- **Web**: Deploy via Vercel; build command `npm run build`, output `.next`, root directory `app/web`. Configure Supabase env vars in Vercel and redeploy the edge function when prompts change.
- **Mobile**: Build OTA updates through Expo (`expo publish`) or native binaries via `eas build`. Bundle identifier is `com.growtoday.growtoday`—use this in App Store Connect and keep it stable across releases. Ensure that `babel.config.js` and `babel-preset-expo` stay in sync.

## Additional resources

- [AGENTS.md](AGENTS.md) – team guidelines and conventions.
- [supabase/README.md](supabase/README.md) – database + edge-function setup.
- [app/web/README.md](app/web/README.md) – web-specific workflow.
- [app/mobile/README.md](app/mobile/README.md) – mobile quickstart and troubleshooting.

Feel free to extend the docs as the product evolves (milestones, analytics, OTA strategy, etc.).
