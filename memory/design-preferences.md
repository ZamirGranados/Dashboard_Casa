---
name: design-preferences
description: User's visual design preferences for the Dashboard_Casa app
metadata:
  type: feedback
---

The user found the default/generic look "muy feo" and asked for a modern redesign (2026-06-11). They communicate in Spanish.

**Why:** They care about polished, modern aesthetics (Linear/Vercel/Stripe style), not just function.

**How to apply:** The app now has a design system — keep using it:
- Font: **Inter** (loaded in [index.html](index.html), set as `font-sans` default in [tailwind.config.js](tailwind.config.js)). Headings use `tracking-tight`.
- Brand color scale `brand-50..900` (blue) in tailwind config; primary actions use `from-brand-500 to-brand-600` gradients with `shadow-glow`.
- Custom soft `boxShadow` tokens (`shadow-sm/card/md`) override Tailwind defaults — diffuse, not harsh.
- Dark shell bg is `#0a0f1d`→`#0d1424` gradient; cards sit on `gray-800/70` with `border-white/5` for layered depth.
- Badges (`Badge` component) use ring + colored status dot (emerald/amber/rose).
- Prefer `rounded-xl`/`rounded-2xl`, slate neutrals, subtle hover lifts (`-translate-y-0.5`).
- **Icons: NO emojis.** Use the `Icon` component + `ICONS` registry in [App.tsx](src/App.tsx) (Lucide-style inline SVG, `currentColor`). Section headings use the `SectionTitle` component (icon chip + tracking-tight text). Add new glyphs to the `ICONS` registry, don't reintroduce emoji.

**Naming (2026-06-11):** "Edificio BGA" was fully renamed to **"Edificio Cumbre"** (incl. the Supabase `inmueble` key — user chose full rename, so old DB rows under "Edificio BGA" must be re-saved). The Contratos section is titled **"Contratos Cumbre"**. Internal identifiers (`id: 'bga'`, `EdificioBGA` fn, `predialBGA`) stay as-is — only user-facing text changed.
