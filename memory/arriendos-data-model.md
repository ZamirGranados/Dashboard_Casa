---
name: arriendos-data-model
description: How the Edificio Cumbre arriendos table stores rent, payment status, notes, and how "received" is computed
metadata:
  type: project
---

Edificio Cumbre "Arriendos" table model (as of 2026-06-11):

- Columns shown: **Apto · Arrendatario · Canon · Notas · Estado**. The old "Valor recibido" numeric column was removed.
- **"Money received" is DERIVED, not stored**: `recibidoMes(a, mes)` = `a.canon` when that month's estado is `'pagado'`, else `0`. Finanzas + Inicio totals use this. `abono` counts as 0. The `pago.valor` field still exists in the type/DB (`valor_pagado`) but is no longer edited/displayed — don't resurrect a valor input expecting Finanzas to read it.
- **Notas** are per-arrendatario (not per-month), stored in `arrendatarios.notas` (text column — required `alter table arrendatarios add column if not exists notas text`). saveToDB writes it via a conditional spread `...(a.notas ? { notas: a.notas } : {})`.
- The table card has its own small **Guardar** button (calls App's `handleSave`), passed as `onSave`/`saving` props. Lotes/Finanzas/Impuestos each have their own `SaveButton` too; the global top Guardar was removed (only Actualizar remains up top). Saving is global — any button writes the whole state.
- **saveToDB now wraps every Supabase call in a `check()` helper that throws on `res.error`** — previously errors were ignored and saving falsely reported success. `handleSave` shows `e.message` in `saveError`. If a save silently did nothing before, suspect a missing column/RLS now surfaced.
- **Servicios públicos (recibos)** model changed (2026-06-11): `ServicioPublico` is now `{ nombre, numeroSuscriptor, fechaPago ('YYYY-MM-DD'), monto, estado }` — the old `diaVence` (day-of-month) was replaced by a full date `fechaPago`. UI is an inline-editable table (`ServiciosPublicosCard`) with columns Recibo · N° suscriptor · Fecha de pago · Precio · Estado; updates are **index-based** (`updateServicio(index, changes)`, `removeServicio(index)`, `addServicio()` no-arg) so the editable `nombre` doesn't break the key. Alerts use `daysUntilDate(fechaPago)`. DB columns needed on `servicios`: `numero_suscriptor` (text), `fecha_pago` (date); `dia_pago` is still written (derived from the date) for back-compat.
- **Months persist via a dedicated `meses` table** (2026-06-11): `mesesCols` is now saved (delete-all + insert) and loaded from `public.meses(id, mes text)`, unioned with months found in pagos/gastos, so empty months survive a reload. saveToDB takes `mesesCols`; loadFromDB's early-return also checks `mesesRows`. Requires the `meses` table + an `auth_full_access` RLS policy in Supabase.
- **DB schema gotcha:** the `lotes` table needs columns `nombre` (text) and `predial_por_anio` (jsonb). saveToDB always writes them. If missing, lote inserts fail. See [[auth-and-security]].
- **Lote predial is PER YEAR** (as of 2026-06-11): `Lote.predialPorAnio: Record<yearString, { monto, estado }>` replaced the old single `predialMonto`/`predialEstado`. The shared `YearInput` (in Lotes + Impuestos headers, value = `prediales[0].anio`) selects which year's predial is shown/edited. Helper `lotePredialDe(l, anio)` returns `{ monto, estado }` (defaults `{0,'pendiente'}`). DB column is `predial_por_anio jsonb`; loadFromDB migrates legacy `predial_monto`/`predial_estado` into the current year if the jsonb is empty. The Edificio Cumbre predial (separate `prediales` table) is still single-value, not per-year.
- **saveToDB bug fixed:** pagos are now linked to inserted arrendatarios by **insertion order index** (`insertedArr[i].id`), NOT by `apto`. The old apto-keyed map dropped pagos when aptos were empty/duplicated — never reintroduce apto-keying. See [[auth-and-security]] for the RLS context.
