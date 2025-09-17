# Supabase Setup

Follow these steps to wire the web and mobile shells to a Supabase backend.

## 1. Create a Supabase Project
1. Sign in to [Supabase](https://supabase.com/). Create a new project named **AI Journal** (or similar).
2. Choose the **Free** plan for development. Pick a strong database password and store it in your password manager.
3. Copy the **Project URL** and **anon public key** (Settings → API). You will add these to the app environments later.

## 2. Configure Authentication
1. Navigate to **Authentication → Providers**.
2. Enable **Email/Password** and **Magic Link (OTP)**. Optional: enable social providers you plan to support.
3. Under **Authentication → Policies**, ensure email confirmation is enabled if you want verification before login.

## 3. Apply Database Schema
1. Install the Supabase CLI locally (`brew install supabase/tap/supabase` or per official docs) if you want migrations.
2. Run the migration:
   ```bash
   cd path/to/repo
   supabase link --project-ref <project-ref>
   supabase db push
   ```
   Alternatively, open the Supabase SQL editor and run the contents of [`migrations/0001_create_journal_tables.sql`](migrations/0001_create_journal_tables.sql).

This migration creates:
- `profiles`: mirrors `auth.users` for basic metadata.
- `journal_entries`: stores user entries with mood and AI summary fields.
- `entry_insights`: optional structured insights attached to entries.
- `healthcheck`: simple table for connectivity tests.
- Row Level Security (RLS) policies restricting access to the entry owner.

## 4. Environment Variables
Populate the environment files with project keys:

```bash
# app/web/.env.local
dcp app/web/.env.local.example app/web/.env.local
# app/mobile/.env
dcp app/mobile/.env.example app/mobile/.env
```

Replace placeholders with values from **Settings → API**:

- `NEXT_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `EXPO_PUBLIC_SUPABASE_ANON_KEY`

For server-side admin tasks (e.g., scheduled jobs), store the service role key separately (never ship to client apps).

## 5. Test the Connection
- Web: `npm run dev:web` → click **Test Supabase Connection**.
- Mobile: `npm run start:mobile` → press **Test Supabase Connection** in the simulator/Expo Go.

If the healthcheck table exists and credentials are correct, you should see a success message. Otherwise the warnings will include the Supabase error for quick debugging.

## 6. Next Steps
- Add database migrations for prompts, AI sessions, or analytics as features land.
- Create Supabase Edge Functions for AI calls or scheduled summaries.
- Set up backups and access policies before shipping to production.
