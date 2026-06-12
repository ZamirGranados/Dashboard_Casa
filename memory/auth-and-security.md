---
name: auth-and-security
description: Auth + RLS security model for Dashboard_Casa (Supabase Auth, authenticated-only RLS, private contratos bucket)
metadata:
  type: project
---

As of 2026-06-11 the app is gated by **Supabase Auth** (email/password). User: zamirpenaloza@gmail.com (created manually in Supabase → Authentication → Users, "Auto Confirm" on).

- Login UI is the `Login` component in [App.tsx](src/App.tsx); `App` tracks `session` via `supabase.auth.getSession()` + `onAuthStateChange`. Data loads only after a session exists. Logout button is in the sidebar footer.
- **RLS is locked to the `authenticated` role** on all public tables (arrendatarios, pagos, prediales, servicios, lotes, gastos_fijos) via a `"auth_full_access" ... for all to authenticated using(true) with check(true)` policy. The old `anon`/public policies were dropped. This SQL lives only in Supabase, not in the repo.
- The **`contratos` storage bucket is private** (`public = false`). Object policies are `authenticated`-only. The Contratos component uses `createSignedUrl(name, 120, ...)` (NOT `getPublicUrl`) for Ver/Descargar.

**Why:** The anon key is shipped in the frontend bundle, so an anon-readable DB = publicly readable. Real protection requires authenticated-only RLS.

**How to apply:** If adding new tables, add an authenticated RLS policy or they'll be inaccessible to the logged-in app. Never reintroduce `to anon` policies. Keep storage access via signed URLs. I cannot run SQL on their Supabase — provide copy-paste SQL for the SQL Editor.
