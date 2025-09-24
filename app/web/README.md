# Web App

Next.js companion experience for the AI journaling platform. Uses the App Router, Tailwind CSS 4, and Supabase SSR helpers.

## Scripts
- `npm run dev` starts the development server on port 3000.
- `npm run lint` runs Next.js ESLint rules.
- `npm run test` executes unit tests with Jest and React Testing Library.
- `npm run test:e2e` runs Playwright end-to-end tests (auto-starts the dev server).
- `npm run test:e2e:ui` opens the Playwright inspector.
- AI reflections generate automatically once a journal entry is captured; the button remains as a manual fallback.

## End-to-End Testing
1. Install Playwright browsers once per machine: `npx playwright install`.
2. Run `npm run test:e2e` from this workspace or `npm run test:web:e2e` at the monorepo root (defaults to port 3100).
3. Optionally set `PLAYWRIGHT_BASE_URL`, `PLAYWRIGHT_HOST`, or `PLAYWRIGHT_PORT` env vars to test against different environments.
4. Supabase calls are stubbed during tests via `NEXT_PUBLIC_SUPABASE_TEST_STUB=1`; unset or override to exercise a real backend.

Test specs live in `tests/e2e`. Keep flows focused on the journaling loop (capture → reflection → suggested action).
