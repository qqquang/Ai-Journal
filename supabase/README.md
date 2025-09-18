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

## 4. Edge Function: `generate-reflection`
1. Install the Supabase CLI if you have not already (`brew install supabase/tap/supabase`).
2. Create an Edge Function stub:
   ```bash
   supabase functions new generate-reflection
   ```
3. Implement your AI call inside `supabase/functions/generate-reflection/index.ts`. The client expects a JSON response shaped like:
   ```json
   {
     "reflection": "Concise AI reflection text",
     "action": "Optional next action suggestion"
   }
   ```
4. Deploy the function when you are ready:
   ```bash
   supabase functions deploy generate-reflection --project-ref <project-ref>
   ```
5. During development run the function locally alongside the studio:
   ```bash
   supabase functions serve generate-reflection --project-ref <project-ref>
   ```
6. Smoke test the output:
   ```bash
   curl -X POST \
     -H "Content-Type: application/json" \
     "http://localhost:54321/functions/v1/generate-reflection" \
     -d '{"entryId":"example","goal":"Ship MVP","content":"Today I iterated on the journaling screen and felt energized."}'
   ```
7. Store your Gemini API key so the function can call the model (optional fallback will run without it):
   ```bash
   supabase secrets set GEMINI_API_KEY=ya29....
   ```

## 5. Environment Variables
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

## 6. Test the Connection
- Web: `npm run dev:web` → sign in, add a journal entry, then press **Generate Reflection**.
- Mobile: `npm run start:mobile` → sign in, add a journal entry, then press **Generate Reflection** in the simulator/Expo Go.

If the healthcheck table exists and credentials are correct, you should see a success message. Otherwise the warnings will include the Supabase error for quick debugging.

## 7. Next Steps
- Add database migrations for prompts, AI sessions, or analytics as features land.
- Create Supabase Edge Functions for AI calls or scheduled summaries.
- Set up backups and access policies before shipping to production.
