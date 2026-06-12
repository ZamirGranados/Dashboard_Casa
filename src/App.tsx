import { useState, useEffect } from 'react'
import type { Session } from '@supabase/supabase-js'
import './App.css'
import { supabase } from './lib/supabase'

// ── Types ──────────────────────────────────────────────────────
type PayStatus = 'pagado' | 'abono' | 'pendiente'

interface Arrendatario {
  id: number
  apto: string
  nombre: string
  canon: number
  venceContrato: string
  notas?: string
  pagos: { mes: string; estado: PayStatus; valor: number }[]
}

interface ServicioPublico {
  nombre: string            // nombre del recibo (Gas, Agua, Energía…)
  numeroSuscriptor: string  // número de suscriptor / cuenta contrato
  fechaPago: string         // fecha límite de pago 'YYYY-MM-DD' (recordatorio)
  monto: number
  estado: PayStatus
}

interface Predial {
  entidad: string
  anio: number
  monto: number
  estado: PayStatus
  vencimiento: string
}

interface LotePredial {
  monto: number
  estado: PayStatus
}

interface Lote {
  id: number
  nombre: string
  registro: string
  avaluo: number
  metraje: number
  // Predial (impuesto) stored per year, keyed by year string e.g. { "2026": {...} }
  predialPorAnio: Record<string, LotePredial>
}

interface GastoItem {
  id: number
  nombre: string
  monto: number
}

interface OtroGastoFijo {
  id: number
  nombre: string
  valor: number
}

type UpdatePagoFn = (arrendatarioId: number, mes: string, changes: Partial<{ valor: number; estado: PayStatus }>) => void
type UpdateArrendatarioFn = (id: number, changes: Partial<Pick<Arrendatario, 'apto' | 'nombre' | 'canon' | 'venceContrato' | 'notas'>>) => void
type UpdateServicioFn = (index: number, changes: Partial<ServicioPublico>) => void

// ── Initial data ───────────────────────────────────────────────
const TODAY = new Date()  // fecha real de hoy

const MESES_INICIALES = ['2026-05']

const INITIAL_ARRENDATARIOS: Arrendatario[] = [
  {
    id: 1, apto: '101', nombre: 'Carlos Ramírez', canon: 1_200_000,
    venceContrato: '2026-07-15',
    pagos: [{ mes: '2026-05', estado: 'pendiente', valor: 0 }],
  },
  {
    id: 2, apto: '102', nombre: 'María Torres', canon: 950_000,
    venceContrato: '2026-09-30',
    pagos: [{ mes: '2026-05', estado: 'pendiente', valor: 0 }],
  },
  {
    id: 3, apto: '201', nombre: 'Andrés Pérez', canon: 1_350_000,
    venceContrato: '2027-01-31',
    pagos: [{ mes: '2026-05', estado: 'pendiente', valor: 0 }],
  },
  {
    id: 4, apto: '202', nombre: 'Laura Gómez', canon: 1_100_000,
    venceContrato: '2026-08-15',
    pagos: [{ mes: '2026-05', estado: 'pendiente', valor: 0 }],
  },
  {
    id: 5, apto: 'Local 1', nombre: 'Inversiones Morales SAS', canon: 2_500_000,
    venceContrato: '2026-06-30',
    pagos: [{ mes: '2026-05', estado: 'pendiente', valor: 0 }],
  },
]

const INITIAL_SERVICIOS: ServicioPublico[] = [
  { nombre: 'Energía',        numeroSuscriptor: '', fechaPago: '2026-06-15', monto: 850_000, estado: 'pendiente' },
  { nombre: 'Agua',           numeroSuscriptor: '', fechaPago: '2026-06-20', monto: 420_000, estado: 'pagado'    },
  { nombre: 'Gas',            numeroSuscriptor: '', fechaPago: '2026-06-10', monto: 180_000, estado: 'pagado'    },
  { nombre: 'Internet',       numeroSuscriptor: '', fechaPago: '2026-06-05', monto: 95_000,  estado: 'pendiente' },
  { nombre: 'Administración', numeroSuscriptor: '', fechaPago: '2026-06-25', monto: 320_000, estado: 'pendiente' },
]

const INITIAL_PREDIALES: Predial[] = [
  { entidad: 'Edificio Cumbre',      anio: 2026, monto: 3_200_000, estado: 'pendiente', vencimiento: '2026-06-30' },
]

const INITIAL_LOTES: Lote[] = [
  { id: 1, nombre: 'Lote 1 · Sector Norte',  registro: 'R-2021-001', avaluo: 45_000_000, metraje: 500, predialPorAnio: { '2026': { monto: 350_000, estado: 'pagado'    } } },
  { id: 2, nombre: 'Lote 2 · Sector Sur',    registro: 'R-2021-002', avaluo: 38_000_000, metraje: 420, predialPorAnio: { '2026': { monto: 290_000, estado: 'pendiente' } } },
  { id: 3, nombre: 'Lote 3 · Vía Principal', registro: 'R-2022-005', avaluo: 62_000_000, metraje: 680, predialPorAnio: { '2026': { monto: 480_000, estado: 'pendiente' } } },
  { id: 4, nombre: 'Lote 4 · Esquinero',     registro: 'R-2022-008', avaluo: 55_000_000, metraje: 610, predialPorAnio: { '2026': { monto: 400_000, estado: 'abono'     } } },
]

// ── Helpers ────────────────────────────────────────────────────
const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)

// Compact currency for tight spaces (donut centers): 1.234.567 → "$1,2M", 850000 → "$850K"
const copCompact = (n: number) => {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${abs}`
}

const mesLabel = (mes: string) => {
  const [y, m] = mes.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(m) - 1]} ${y}`
}

const nextMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// Money "received" in a month = the full canon when marked 'pagado', else 0
const recibidoMes = (a: Arrendatario, mes: string) =>
  a.pagos.find(p => p.mes === mes)?.estado === 'pagado' ? a.canon : 0

// A lote's predial (monto + estado) for a given year — empty default if not set
const lotePredialDe = (l: Lote, anio: number): LotePredial =>
  l.predialPorAnio?.[String(anio)] ?? { monto: 0, estado: 'pendiente' }

// Whole days from today until a 'YYYY-MM-DD' date (negative = overdue, null = no date)
const daysUntilDate = (dateStr: string): number | null => {
  if (!dateStr) return null
  const d = new Date(dateStr + 'T00:00:00')
  if (isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - new Date(TODAY.toDateString()).getTime()) / 86_400_000)
}

// Short date label e.g. "15 Jun 2026"
const fechaLabel = (dateStr: string) => {
  if (!dateStr) return '—'
  const [y, m, d] = dateStr.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${parseInt(d)} ${names[parseInt(m) - 1]} ${y}`
}

// ── Icons (elegant line-art, Lucide-style) ─────────────────────
type IconName =
  | 'dashboard' | 'building' | 'home' | 'utensils' | 'mountain' | 'wallet'
  | 'landmark' | 'file' | 'sun' | 'moon' | 'chevronLeft' | 'chevronRight'
  | 'bell' | 'grid' | 'refresh' | 'save' | 'pencil' | 'x' | 'plus'
  | 'zap' | 'check' | 'paperclip' | 'eye' | 'eyeOff' | 'download'
  | 'mail' | 'lock' | 'logout'

const ICONS: Record<IconName, React.ReactNode> = {
  dashboard: <><rect width="7" height="9" x="3" y="3" rx="1.5" /><rect width="7" height="5" x="14" y="3" rx="1.5" /><rect width="7" height="9" x="14" y="12" rx="1.5" /><rect width="7" height="5" x="3" y="16" rx="1.5" /></>,
  building: <><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z" /><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2" /><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2" /><path d="M10 6h4M10 10h4M10 14h4M10 18h4" /></>,
  home: <><path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" /><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></>,
  utensils: <><path d="M3 2v7c0 1.1.9 2 2 2a2 2 0 0 0 2-2V2" /><path d="M7 2v20" /><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7" /></>,
  mountain: <path d="m8 3 4 8 5-5 5 15H2L8 3z" />,
  wallet: <><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></>,
  landmark: <><line x1="3" x2="21" y1="22" y2="22" /><line x1="6" x2="6" y1="18" y2="11" /><line x1="10" x2="10" y1="18" y2="11" /><line x1="14" x2="14" y1="18" y2="11" /><line x1="18" x2="18" y1="18" y2="11" /><polygon points="12 2 20 7 4 7" /></>,
  file: <><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" /><path d="M14 2v4a2 2 0 0 0 2 2h4" /><path d="M16 13H8M16 17H8M10 9H8" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" /></>,
  moon: <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />,
  chevronLeft: <path d="m15 18-6-6 6-6" />,
  chevronRight: <path d="m9 18 6-6-6-6" />,
  bell: <><path d="M10.268 21a2 2 0 0 0 3.464 0" /><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326" /></>,
  grid: <><rect width="7" height="7" x="3" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="3" rx="1.5" /><rect width="7" height="7" x="14" y="14" rx="1.5" /><rect width="7" height="7" x="3" y="14" rx="1.5" /></>,
  refresh: <><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M8 16H3v5" /></>,
  save: <><path d="M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" /><path d="M17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7" /><path d="M7 3v4a1 1 0 0 0 1 1h7" /></>,
  pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" /></>,
  x: <path d="M18 6 6 18M6 6l12 12" />,
  plus: <path d="M5 12h14M12 5v14" />,
  zap: <path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z" />,
  check: <><path d="M21.801 10A10 10 0 1 1 17 3.335" /><path d="m9 11 3 3L22 4" /></>,
  paperclip: <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />,
  eye: <><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49" /><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242" /><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143" /><path d="m2 2 20 20" /></>,
  download: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>,
  mail: <><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></>,
  lock: <><rect width="18" height="11" x="3" y="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" x2="9" y1="12" y2="12" /></>,
}

function Icon({ name, className = 'w-5 h-5', strokeWidth = 1.75 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  )
}

function SectionTitle({ icon, children }: { icon: IconName; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-slate-800 dark:text-white">
      <span className="grid place-items-center w-10 h-10 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400 ring-1 ring-brand-100 dark:ring-brand-500/20">
        <Icon name={icon} className="w-[22px] h-[22px]" />
      </span>
      {children}
    </h2>
  )
}

// ── DB: load ───────────────────────────────────────────────────
async function loadFromDB() {
  const [
    { data: arr }, { data: pag }, { data: pred },
    { data: serv }, { data: lot }, { data: gast }, { data: mesesRows }, { data: recur }, { data: servUis }, { data: otrosGastosUis },
  ] = await Promise.all([
    supabase.from('arrendatarios').select('*').order('created_at'),
    supabase.from('pagos').select('*'),
    supabase.from('prediales').select('*').order('created_at'),
    supabase.from('servicios').select('*').eq('inmueble', 'Edificio Cumbre').order('created_at'),
    supabase.from('lotes').select('*').order('created_at'),
    supabase.from('gastos_fijos').select('*').order('mes'),
    supabase.from('meses').select('mes').order('mes'),
    supabase.from('gastos_recurrentes').select('*').order('created_at'),
    supabase.from('servicios_uis').select('*').order('created_at'),
    supabase.from('otros_gastos_uis').select('*').order('created_at'),
  ])

  if (!arr?.length && !pred?.length && !serv?.length && !lot?.length && !mesesRows?.length) return null

  const pagosByArr: Record<string, { mes: string; valor_pagado: number; estado: string }[]> = {}
  pag?.forEach(p => {
    if (!pagosByArr[p.arrendatario_id]) pagosByArr[p.arrendatario_id] = []
    pagosByArr[p.arrendatario_id].push(p)
  })

  const arrendatarios: Arrendatario[] = (arr ?? []).map((a, i) => ({
    id: i + 1,
    nombre: a.nombre,
    apto: a.apto,
    canon: a.canon_actual,
    venceContrato: a.fecha_fin ?? '',
    notas: (a as { notas?: string }).notas ?? '',
    pagos: (pagosByArr[a.id] ?? []).map(p => ({
      mes: p.mes,
      valor: p.valor_pagado,
      estado: p.estado as PayStatus,
    })),
  }))

  const PREDIALES_ORDEN = ['Edificio Cumbre']
  type PredRow = { inmueble: string; anio: number; valor: number; pagado: boolean; fecha_limite: string | null }
  const predMap: Record<string, PredRow> = {}
  pred?.forEach(p => { if (p) predMap[p.inmueble] = p })
  const prediales: Predial[] = PREDIALES_ORDEN.map((nombre, i) => {
    const p = predMap[nombre]
    if (!p) return INITIAL_PREDIALES[i]
    return {
      entidad: p.inmueble,
      anio: p.anio,
      monto: p.valor,
      estado: (p.pagado ? 'pagado' : 'pendiente') as PayStatus,
      vencimiento: p.fecha_limite ?? '',
    }
  })

  const mapServicio = (s: { nombre: string }): ServicioPublico => ({
    nombre: s.nombre,
    numeroSuscriptor: (s as { numero_suscriptor?: string }).numero_suscriptor ?? '',
    fechaPago: (s as { fecha_pago?: string }).fecha_pago ?? '',
    monto: (s as { monto?: number }).monto ?? 0,
    estado: ((s as { estado?: string }).estado ?? 'pendiente') as PayStatus,
  })
  const servicios: ServicioPublico[] = (serv ?? []).map(mapServicio)
  const serviciosUis: ServicioPublico[] = (servUis ?? []).map(mapServicio)

  const anioActual = String(prediales[0]?.anio ?? 2026)
  const lotes: Lote[] = (lot ?? []).map((l, i) => {
    const jsonPred = (l as { predial_por_anio?: Record<string, LotePredial> | null }).predial_por_anio
    const legacyMonto = (l as { predial_monto?: number }).predial_monto
    const legacyEstado = (l as { predial_estado?: string }).predial_estado as PayStatus | undefined
    let predialPorAnio: Record<string, LotePredial> =
      jsonPred && typeof jsonPred === 'object' ? jsonPred : {}
    // Migrate old single-value predial into the current year if no per-year data
    if (Object.keys(predialPorAnio).length === 0 && (legacyMonto || legacyEstado)) {
      predialPorAnio = { [anioActual]: { monto: legacyMonto ?? 0, estado: legacyEstado ?? 'pendiente' } }
    }
    return {
      id: i + 1,
      nombre: (l as { nombre?: string }).nombre ?? '',
      registro: l.numero_registro,
      avaluo: l.avaluo_catastral,
      metraje: l.metraje,
      predialPorAnio,
    }
  })

  const gastosVar: Record<string, GastoItem[]> = {}
  ;(gast ?? []).forEach((g, i) => {
    if (!gastosVar[g.mes]) gastosVar[g.mes] = []
    gastosVar[g.mes].push({ id: Date.now() + i, nombre: g.nombre, monto: g.valor })
  })

  const mesesSet = new Set<string>()
  mesesRows?.forEach(m => m.mes && mesesSet.add(m.mes))
  pag?.forEach(p => mesesSet.add(p.mes))
  gast?.forEach(g => mesesSet.add(g.mes))
  const mesesCols = mesesSet.size > 0 ? Array.from(mesesSet).sort() : MESES_INICIALES

  const gastosFijos: GastoItem[] = (recur ?? []).map((g, i) => ({
    id: Date.now() + i, nombre: g.nombre, monto: g.valor,
  }))

  const otrosGastosFijos: OtroGastoFijo[] = (otrosGastosUis ?? []).map((g, i) => ({
    id: g.id || Date.now() + i, nombre: g.nombre, valor: g.valor,
  }))

  return { arrendatarios, prediales, servicios, serviciosUis, lotes, mesesCols, gastosVar, gastosFijos, otrosGastosFijos }
}

// ── DB: save ───────────────────────────────────────────────────
async function saveToDB(state: {
  arrendatarios: Arrendatario[]
  prediales: Predial[]
  servicios: ServicioPublico[]
  serviciosUis: ServicioPublico[]
  lotes: Lote[]
  gastosVar: Record<string, GastoItem[]>
  gastosFijos: GastoItem[]
  otrosGastosFijos: OtroGastoFijo[]
  mesesCols: string[]
}) {
  const { arrendatarios, prediales, servicios, serviciosUis, lotes, gastosVar, gastosFijos, otrosGastosFijos, mesesCols } = state

  // Supabase returns { error } instead of throwing — surface it so saving never
  // reports success when a table/column is missing or RLS blocks the write.
  const check = <T extends { error: { message: string } | null }>(label: string, res: T): T => {
    if (res.error) throw new Error(`${label}: ${res.error.message}`)
    return res
  }

  check('borrar pagos', await supabase.from('pagos').delete().not('id', 'is', null))
  check('borrar arrendatarios', await supabase.from('arrendatarios').delete().not('id', 'is', null))

  if (arrendatarios.length > 0) {
    const { data: insertedArr } = check('guardar arrendatarios', await supabase
      .from('arrendatarios')
      .insert(arrendatarios.map(a => ({
        nombre: a.nombre || 'Sin nombre',
        apto: a.apto || 'Sin apto',
        canon_actual: a.canon,
        fecha_inicio: '2025-01-01',
        fecha_fin: a.venceContrato || '2026-12-31',
        ...(a.notas ? { notas: a.notas } : {}),
      })))
      .select('id'))

    if (insertedArr?.length) {
      // Map by insertion order (PostgREST returns rows in input order) — robust
      // even when aptos are empty or duplicated.
      const pagosRows = arrendatarios.flatMap((a, i) => {
        const dbId = insertedArr[i]?.id
        if (!dbId) return []
        return a.pagos.map(p => ({
          arrendatario_id: dbId,
          mes: p.mes,
          valor_pagado: p.valor,
          estado: p.estado,
        }))
      })
      if (pagosRows.length > 0) check('guardar pagos', await supabase.from('pagos').insert(pagosRows))
    }
  }

  check('borrar prediales', await supabase.from('prediales').delete().not('id', 'is', null))
  if (prediales.length > 0) {
    check('guardar prediales', await supabase.from('prediales').insert(prediales.map(p => ({
      inmueble: p.entidad,
      anio: p.anio,
      valor: p.monto,
      pagado: p.estado === 'pagado',
      fecha_limite: p.vencimiento || null,
    }))))
  }

  const saveServicios = async (inmueble: string, list: ServicioPublico[]) => {
    check(`borrar servicios ${inmueble}`, await supabase.from('servicios').delete().eq('inmueble', inmueble))
    if (list.length > 0) {
      check(`guardar servicios ${inmueble}`, await supabase.from('servicios').insert(list.map(s => ({
        nombre: s.nombre,
        // keep dia_pago populated (derived from the date) in case the column is NOT NULL
        dia_pago: s.fechaPago ? new Date(s.fechaPago + 'T00:00:00').getDate() : 1,
        inmueble,
        monto: s.monto,
        estado: s.estado,
        numero_suscriptor: s.numeroSuscriptor || null,
        fecha_pago: s.fechaPago || null,
      }))))
    }
  }
  await saveServicios('Edificio Cumbre', servicios)

  // Apartamento UIS — tabla dedicada (sin columna inmueble)
  check('borrar servicios UIS', await supabase.from('servicios_uis').delete().not('id', 'is', null))
  if (serviciosUis.length > 0) {
    check('guardar servicios UIS', await supabase.from('servicios_uis').insert(serviciosUis.map(s => ({
      nombre: s.nombre,
      numero_suscriptor: s.numeroSuscriptor || null,
      fecha_pago: s.fechaPago || null,
      monto: s.monto,
      estado: s.estado,
    }))))
  }

  check('borrar lotes', await supabase.from('lotes').delete().not('id', 'is', null))
  if (lotes.length > 0) {
    check('guardar lotes', await supabase.from('lotes').insert(lotes.map(l => ({
      numero_registro: l.registro || 'Sin registro',
      avaluo_catastral: l.avaluo,
      metraje: l.metraje,
      nombre: l.nombre,
      predial_por_anio: l.predialPorAnio,
    }))))
  }

  check('borrar gastos', await supabase.from('gastos_fijos').delete().not('id', 'is', null))
  const gastosRows = Object.entries(gastosVar).flatMap(([mes, items]) =>
    items.filter(g => g.nombre).map(g => ({ nombre: g.nombre, valor: g.monto, mes }))
  )
  if (gastosRows.length > 0) check('guardar gastos', await supabase.from('gastos_fijos').insert(gastosRows))

  // Gastos fijos recurrentes (mismos todos los meses)
  check('borrar gastos fijos', await supabase.from('gastos_recurrentes').delete().not('id', 'is', null))
  const fijosRows = gastosFijos.filter(g => g.nombre).map(g => ({ nombre: g.nombre, valor: g.monto }))
  if (fijosRows.length > 0) check('guardar gastos fijos', await supabase.from('gastos_recurrentes').insert(fijosRows))

  // Otros gastos fijos (Apartamento UIS)
  check('borrar otros gastos UIS', await supabase.from('otros_gastos_uis').delete().not('id', 'is', null))
  const otrosRows = otrosGastosFijos.filter(g => g.nombre && g.valor > 0).map(g => ({ nombre: g.nombre, valor: g.valor }))
  if (otrosRows.length > 0) check('guardar otros gastos UIS', await supabase.from('otros_gastos_uis').insert(otrosRows))

  // Persist the month list so empty months survive a reload too
  check('borrar meses', await supabase.from('meses').delete().not('id', 'is', null))
  if (mesesCols.length > 0) {
    check('guardar meses', await supabase.from('meses').insert(mesesCols.map(mes => ({ mes }))))
  }
}

function Badge({ estado }: { estado: PayStatus }) {
  const cls: Record<PayStatus, string> = {
    pagado:    'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/20',
    abono:     'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    pendiente: 'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/20',
  }
  const dot: Record<PayStatus, string> = {
    pagado:    'bg-emerald-500',
    abono:     'bg-amber-500',
    pendiente: 'bg-rose-500',
  }
  const label: Record<PayStatus, string> = { pagado: 'Pagado', abono: 'Abono', pendiente: 'Pendiente' }
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ring-1 ring-inset ${cls[estado]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dot[estado]}`} />
      {label[estado]}
    </span>
  )
}

// ── Money input ($ prefix + thousands separators) ──────────────
function MoneyInput({ value, onChange, widthClass = 'w-full' }: {
  value: number
  onChange: (n: number) => void
  widthClass?: string
}) {
  return (
    <div className={`relative inline-block ${widthClass}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-gray-400 dark:text-gray-500">$</span>
      <input
        type="text"
        inputMode="numeric"
        value={value ? new Intl.NumberFormat('es-CO').format(value) : ''}
        onChange={e => onChange(Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0))}
        className="w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg pl-6 pr-2 py-1.5 text-sm text-right text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </div>
  )
}

// ── Save button (shared) — triggers the global save from any section ──
function SaveButton({ onSave, saving }: { onSave: () => void; saving: boolean }) {
  return (
    <button
      onClick={onSave}
      disabled={saving}
      className="flex items-center gap-1.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 disabled:opacity-60 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm transition-all"
    >
      {saving
        ? <><span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando…</>
        : <><Icon name="save" className="w-4 h-4" /> Guardar</>}
    </button>
  )
}

// ── Year selector (shared) ─────────────────────────────────────
function YearInput({ anio, setAnio }: { anio: number; setAnio: (n: number) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-gray-400">
      Año
      <input
        type="number" min={2000} max={2100} value={anio}
        onChange={e => setAnio(Number(e.target.value) || anio)}
        className="w-24 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-brand-500"
      />
    </label>
  )
}

// ── Section: Inicio / Alertas ──────────────────────────────────
function InicioAlertas({
  arrendatarios, servicios, lotes, mesesCols, gastosVar, gastosFijos, anio, onNavigate,
}: {
  arrendatarios: Arrendatario[]
  servicios: ServicioPublico[]
  lotes: Lote[]
  mesesCols: string[]
  gastosVar: Record<string, GastoItem[]>
  gastosFijos: GastoItem[]
  anio: number
  onNavigate: (section: string) => void
}) {
  const lotePredialAlerts = lotes.filter(l => lotePredialDe(l, anio).estado !== 'pagado')
  const servicioAlerts = servicios
    .filter(s => s.estado !== 'pagado')
    .map(s => ({ ...s, diasRestantes: daysUntilDate(s.fechaPago) }))
    .sort((a, b) => (a.diasRestantes ?? 9999) - (b.diasRestantes ?? 9999))

  const noAlerts = servicioAlerts.length === 0 && lotePredialAlerts.length === 0

  const urgenciaTag = (dias: number | null) => {
    if (dias === null) return { text: 'Sin fecha',       cls: 'text-gray-400 dark:text-gray-500' }
    if (dias < 0)   return { text: 'Vencido',          cls: 'text-red-600 dark:text-red-400 font-bold' }
    if (dias === 0)  return { text: '¡Hoy!',           cls: 'text-red-600 dark:text-red-400 font-bold' }
    if (dias <= 5)   return { text: `${dias} días`,    cls: 'text-red-600 dark:text-red-400 font-semibold' }
    if (dias <= 15)  return { text: `${dias} días`,    cls: 'text-orange-500 font-semibold' }
    return                   { text: `${dias} días`,    cls: 'text-gray-500 dark:text-gray-400' }
  }

  const ultimoMes = mesesCols[mesesCols.length - 1]
  const totalRecibidoUltimoMes = arrendatarios.reduce((s, a) => s + recibidoMes(a, ultimoMes), 0)
  const totalGastosUltimoMes =
    gastosFijos.reduce((s, g) => s + g.monto, 0) +
    (gastosVar[ultimoMes] ?? []).reduce((s, g) => s + g.monto, 0)
  const saldoUltimoMes = totalRecibidoUltimoMes - totalGastosUltimoMes
  const predialPendienteTotal = lotes
    .map(l => lotePredialDe(l, anio))
    .filter(lp => lp.estado !== 'pagado')
    .reduce((s, lp) => s + lp.monto, 0)

  const navCards: { id: string; icon: IconName; label: string; stat: string }[] = [
    { id: 'bga',        icon: 'building', label: 'Edificio Cumbre',     stat: `${arrendatarios.length} arrendatarios` },
    { id: 'apto-uis',   icon: 'home',     label: 'Apartamento UIS',     stat: 'Servicios públicos' },
    { id: 'barichara',  icon: 'mountain', label: 'Lotes',               stat: `${lotes.length} lotes` },
    { id: 'finanzas',   icon: 'wallet',   label: 'Finanzas',            stat: `Saldo ${mesLabel(ultimoMes)}: ${cop(saldoUltimoMes)}` },
    { id: 'prediales',  icon: 'landmark', label: 'Impuestos Prediales', stat: predialPendienteTotal > 0 ? `Por pagar: ${cop(predialPendienteTotal)}` : 'Todo pagado' },
    { id: 'contratos',  icon: 'file',     label: 'Contratos Cumbre',    stat: 'PDFs de contratos' },
  ]

  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-800 dark:text-white">
          <Icon name="bell" className="w-5 h-5 text-amber-500" /> Alertas
        </h2>

        {noAlerts && (
          <div className="flex items-center justify-center gap-2 bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200/70 dark:border-emerald-500/20 rounded-2xl p-6 text-center">
            <Icon name="check" className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-emerald-700 dark:text-emerald-300 font-medium">Sin alertas pendientes</p>
          </div>
        )}

        {servicioAlerts.length > 0 && (
          <Card title="Servicios públicos — Edificio Cumbre" icon="zap" accent="blue">
            {servicioAlerts.map(s => {
              const { text, cls } = urgenciaTag(s.diasRestantes)
              const rowBg = s.diasRestantes !== null && s.diasRestantes <= 0
                ? 'bg-red-50 dark:bg-red-900/10'
                : s.diasRestantes !== null && s.diasRestantes <= 5 ? 'bg-orange-50 dark:bg-orange-900/10' : ''
              return (
                <div key={s.nombre} className={`px-6 py-4 flex justify-between items-center border-b last:border-0 border-gray-100 dark:border-gray-700 ${rowBg}`}>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">{s.nombre}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Vence: {fechaLabel(s.fechaPago)}
                      {s.numeroSuscriptor && <span className="ml-2 text-gray-400">· N° {s.numeroSuscriptor}</span>}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <span className={`text-xs ${cls}`}>{text}</span>
                    <Badge estado={s.estado} />
                  </div>
                </div>
              )
            })}
          </Card>
        )}

        {lotePredialAlerts.length > 0 && (
          <Card title="Prediales pendientes" icon="landmark" accent="red">
            {lotePredialAlerts.map(l => {
              const lp = lotePredialDe(l, anio)
              return (
              <div key={l.id} className="px-6 py-4 flex justify-between items-center border-b last:border-0 border-gray-100 dark:border-gray-700">
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{l.nombre}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Lote · Año {anio}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cop(lp.monto)}</p>
                  <Badge estado={lp.estado} />
                </div>
              </div>
              )
            })}
          </Card>
        )}
      </div>

      <div>
        <h2 className="flex items-center gap-2.5 text-xl font-bold tracking-tight text-slate-800 dark:text-white mb-4">
          <Icon name="grid" className="w-5 h-5 text-brand-500" /> Secciones
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {navCards.map(card => (
            <button
              key={card.id}
              onClick={() => onNavigate(card.id)}
              className="group bg-white dark:bg-gray-800/70 rounded-2xl shadow-card border border-slate-200/70 dark:border-white/5 p-5 text-left hover:border-brand-300 dark:hover:border-brand-500/40 hover:shadow-md hover:-translate-y-0.5 transition-all"
            >
              <span className="grid place-items-center w-11 h-11 mb-3 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-gray-400 group-hover:bg-brand-500 group-hover:text-white transition-colors">
                <Icon name={card.icon} className="w-[22px] h-[22px]" />
              </span>
              <p className="font-semibold text-slate-800 dark:text-white text-sm group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors">{card.label}</p>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-1 truncate">{card.stat}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── Servicios públicos editable (lista de recibos) ─────────────
const EMPTY_SERVICIO: ServicioPublico = { nombre: '', numeroSuscriptor: '', fechaPago: '', monto: 0, estado: 'pendiente' }

function ServiciosPublicosCard({
  servicios, onUpdate, onAdd, onRemove, onSave, saving,
}: {
  servicios: ServicioPublico[]
  onUpdate: UpdateServicioFn
  onAdd: () => void
  onRemove: (index: number) => void
  onSave: () => void
  saving: boolean
}) {
  const inputCls = 'w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center gap-3 flex-wrap">
        <div>
          <span className="font-semibold text-gray-800 dark:text-white">Servicios públicos</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Recibos — recuerda cuándo pagarlos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" /> Agregar recibo
          </button>
          <SaveButton onSave={onSave} saving={saving} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
            <tr>
              <Th>Recibo</Th>
              <Th>N° suscriptor</Th>
              <Th>Fecha de pago</Th>
              <Th right>Precio</Th>
              <Th center>Estado</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {servicios.map((s, i) => {
              const dias = s.estado !== 'pagado' ? daysUntilDate(s.fechaPago) : null
              const vencido = dias !== null && dias < 0
              const urgente = dias !== null && dias >= 0 && dias <= 5
              return (
                <tr key={i} className={vencido ? 'bg-red-50 dark:bg-red-900/10' : urgente ? 'bg-orange-50 dark:bg-orange-900/10' : ''}>
                  <td className="px-4 py-2">
                    <input type="text" placeholder="Ej: Gas" value={s.nombre}
                      onChange={e => onUpdate(i, { nombre: e.target.value })}
                      className={`${inputCls} min-w-[7rem]`} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="text" placeholder="N° suscriptor" value={s.numeroSuscriptor}
                      onChange={e => onUpdate(i, { numeroSuscriptor: e.target.value })}
                      className={`${inputCls} min-w-[8rem]`} />
                  </td>
                  <td className="px-4 py-2">
                    <input type="date" value={s.fechaPago}
                      onChange={e => onUpdate(i, { fechaPago: e.target.value })}
                      className={`${inputCls} min-w-[9rem]`} />
                    {dias !== null && (
                      <span className={`block mt-0.5 text-xs font-semibold ${vencido ? 'text-red-600 dark:text-red-400' : urgente ? 'text-orange-500' : 'text-gray-400 dark:text-gray-500'}`}>
                        {vencido ? 'Vencido' : dias === 0 ? '¡Hoy!' : `Faltan ${dias} días`}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <MoneyInput value={s.monto} onChange={n => onUpdate(i, { monto: n })} widthClass="w-32" />
                  </td>
                  <td className="px-4 py-2 text-center">
                    <select value={s.estado}
                      onChange={e => onUpdate(i, { estado: e.target.value as PayStatus })}
                      className="bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                      <option value="pagado">Pagado</option>
                      <option value="pendiente">Pendiente</option>
                    </select>
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => onRemove(i)} title="Eliminar recibo"
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Icon name="x" className="w-4 h-4 mx-auto" /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {servicios.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
            Sin recibos — haz clic en "Agregar recibo" para empezar
          </div>
        )}
      </div>
    </div>
  )
}

// ── Otros gastos fijos editable (lista de gastos adicionales) ──
function OtrosGastosCard({
  otrosGastos, onUpdate, onAdd, onRemove, onSave, saving,
}: {
  otrosGastos: OtroGastoFijo[]
  onUpdate: (id: number, changes: Partial<OtroGastoFijo>) => void
  onAdd: () => void
  onRemove: (id: number) => void
  onSave: () => void
  saving: boolean
}) {
  const inputCls = 'w-full bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center gap-3 flex-wrap">
        <div>
          <span className="font-semibold text-gray-800 dark:text-white">Otros gastos fijos</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Gastos adicionales — mantenimiento, seguros, etc.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onAdd}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" /> Agregar gasto
          </button>
          <SaveButton onSave={onSave} saving={saving} />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
            <tr>
              <Th>Concepto</Th>
              <Th right>Monto mensual</Th>
              <Th></Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
            {otrosGastos.map(g => (
              <tr key={g.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                <td className="px-4 py-2">
                  <input type="text" placeholder="Ej: Seguro edificio" value={g.nombre}
                    onChange={e => onUpdate(g.id, { nombre: e.target.value })}
                    className={`${inputCls} min-w-[15rem]`} />
                </td>
                <td className="px-4 py-2 text-right">
                  <MoneyInput value={g.valor} onChange={n => onUpdate(g.id, { valor: n })} widthClass="w-32" />
                </td>
                <td className="px-2 py-2 text-center">
                  <button onClick={() => onRemove(g.id)} title="Eliminar gasto"
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Icon name="x" className="w-4 h-4 mx-auto" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {otrosGastos.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
            Sin gastos adicionales — haz clic en "Agregar gasto" para empezar
          </div>
        )}
      </div>
    </div>
  )
}

// ── Generic SVG donut: pass segments + center content ──────────
function DonutChart({ segments, size = 112, stroke = 13, children }: {
  segments: { value: number; color: string }[]
  size?: number
  stroke?: number
  children?: React.ReactNode
}) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const segs = segments.filter(s => s.value > 0)
  const gap = segs.length > 1 ? 3 : 0
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-gray-100 dark:stroke-gray-700/70" />
        {total > 0 && segs.map((s, i) => {
          const len = (s.value / total) * c
          const dash = Math.max(len - gap, 0.5)
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={stroke} strokeLinecap="butt" strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

// ── Donut chart (SVG) for payment status ───────────────────────
function DonutPagos({ pagado, abono, pendiente, size = 108, stroke = 13 }: {
  pagado: number; abono: number; pendiente: number; size?: number; stroke?: number
}) {
  const total = pagado + abono + pendiente
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const segs = [
    { val: pagado, color: '#10b981' },   // emerald-500
    { val: abono, color: '#f59e0b' },     // amber-500
    { val: pendiente, color: '#f43f5e' }, // rose-500
  ].filter(s => s.val > 0)
  const gap = segs.length > 1 ? 3 : 0  // separación entre segmentos cuando hay varios
  let offset = 0
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke}
          className="stroke-gray-100 dark:stroke-gray-700/70" />
        {total > 0 && segs.map((s, i) => {
          const len = (s.val / total) * c
          const dash = Math.max(len - gap, 0.5)
          const el = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color}
              strokeWidth={stroke} strokeLinecap="butt"
              strokeDasharray={`${dash} ${c - dash}`} strokeDashoffset={-offset} />
          )
          offset += len
          return el
        })}
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">
          <p className="text-2xl font-bold tracking-tight text-gray-800 dark:text-white">{pagado}<span className="text-gray-300 dark:text-gray-600">/{total}</span></p>
          <p className="text-[11px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">pagaron</p>
        </div>
      </div>
    </div>
  )
}

// ── Resumen de pagos por mes (dona + fichas por arrendatario) ──
function ResumenPagosCard({ arrendatarios, mesesCols }: { arrendatarios: Arrendatario[]; mesesCols: string[] }) {
  const chipCls: Record<PayStatus, string> = {
    pagado:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    abono:     'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    pendiente: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300',
  }
  const estadoLabel: Record<PayStatus, string> = { pagado: 'Pagó', abono: 'Abonó', pendiente: 'Pendiente' }
  const estadoDe = (a: Arrendatario, mes: string): PayStatus =>
    a.pagos.find(p => p.mes === mes)?.estado ?? 'pendiente'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
        <p className="font-semibold text-gray-800 dark:text-white">Resumen de pagos por mes</p>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
          <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Verde</span> pagó ·
          <span className="text-amber-600 dark:text-amber-400 font-medium"> ● Amarillo</span> abonó ·
          <span className="text-rose-600 dark:text-rose-400 font-medium"> ● Rojo</span> pendiente
        </p>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {[...mesesCols].reverse().map(mes => {
          const totalMes = arrendatarios.reduce((s, a) => s + recibidoMes(a, mes), 0)
          const counts = arrendatarios.reduce((acc, a) => {
            acc[estadoDe(a, mes)]++
            return acc
          }, { pagado: 0, abono: 0, pendiente: 0 } as Record<PayStatus, number>)
          return (
            <div key={mes} className="px-6 py-4 flex items-center gap-4">
              <DonutPagos pagado={counts.pagado} abono={counts.abono} pendiente={counts.pendiente} />
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-center mb-2 flex-wrap gap-2">
                  <span className="font-semibold text-gray-800 dark:text-white text-sm">{mesLabel(mes)}</span>
                  <span className="font-bold text-green-700 dark:text-green-400 text-sm">{cop(totalMes)}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {arrendatarios.map(a => {
                    const estado = estadoDe(a, mes)
                    return (
                      <span key={a.id} title={`${a.nombre || a.apto || 'Sin nombre'} — ${estadoLabel[estado]}`}
                        className={`inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium ${chipCls[estado]}`}>
                        {a.apto || a.nombre || '—'}
                      </span>
                    )
                  })}
                  {arrendatarios.length === 0 && <span className="text-xs text-gray-400">Sin arrendatarios</span>}
                </div>
              </div>
            </div>
          )
        })}
        {mesesCols.length === 0 && (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">Sin meses registrados</div>
        )}
      </div>
    </div>
  )
}

// ── Section: Apartamento UIS (solo servicios públicos) ─────────
function ApartamentoUis({
  servicios, onUpdate, onAdd, onRemove,
  otrosGastos, onUpdateOtroGasto, onAddOtroGasto, onRemoveOtroGasto,
  onSave, saving
}: {
  servicios: ServicioPublico[]
  onUpdate: UpdateServicioFn
  onAdd: () => void
  onRemove: (index: number) => void
  otrosGastos: OtroGastoFijo[]
  onUpdateOtroGasto: (id: number, changes: Partial<OtroGastoFijo>) => void
  onAddOtroGasto: () => void
  onRemoveOtroGasto: (id: number) => void
  onSave: () => void
  saving: boolean
}) {
  const totalServicios = servicios.reduce((sum, s) => sum + s.monto, 0)
  const totalOtrosGastos = otrosGastos.reduce((sum, g) => sum + g.valor, 0)
  const gastoTotal = totalServicios + totalOtrosGastos

  return (
    <div className="space-y-6">
      <SectionTitle icon="home">Apartamento UIS</SectionTitle>
      <ServiciosPublicosCard servicios={servicios} onUpdate={onUpdate} onAdd={onAdd} onRemove={onRemove} onSave={onSave} saving={saving} />
      <OtrosGastosCard otrosGastos={otrosGastos} onUpdate={onUpdateOtroGasto} onAdd={onAddOtroGasto} onRemove={onRemoveOtroGasto} onSave={onSave} saving={saving} />

      {/* Resumen de gasto mensual */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <p className="font-semibold text-gray-800 dark:text-white">Gasto mensual total</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Servicios públicos + Otros gastos fijos</p>
        </div>
        <div className="p-6 flex flex-col sm:flex-row items-center justify-between gap-8">
          <div className="flex-shrink-0">
            <DonutChart
              segments={[
                { value: totalServicios, color: '#3b82f6' },
                { value: totalOtrosGastos, color: '#ef4444' },
              ]}
              size={140}
              stroke={16}
            >
              <div className="text-center leading-none">
                <p className="text-xl font-bold tracking-tight text-gray-800 dark:text-white">{copCompact(gastoTotal)}</p>
                <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-1">mensual</p>
              </div>
            </DonutChart>
          </div>

          <div className="flex-1 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
                <span className="text-sm text-gray-700 dark:text-gray-300">Servicios públicos</span>
              </div>
              <span className="font-semibold text-gray-800 dark:text-white">{cop(totalServicios)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: '#ef4444' }} />
                <span className="text-sm text-gray-700 dark:text-gray-300">Otros gastos fijos</span>
              </div>
              <span className="font-semibold text-gray-800 dark:text-white">{cop(totalOtrosGastos)}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 dark:text-white">Total mensual</span>
              <span className="text-lg font-bold text-blue-600 dark:text-blue-400">{cop(gastoTotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Section: Edificio Cumbre ──────────────────────────────────────
function EdificioBGA({
  arrendatarios,
  mesesCols,
  onUpdateArrendatario,
  onUpdatePago,
  onAddMes,
  onAddArrendatario,
  onRemoveArrendatario,
  servicios,
  onUpdateServicio,
  onAddServicio,
  onRemoveServicio,
  onSave,
  saving,
}: {
  arrendatarios: Arrendatario[]
  mesesCols: string[]
  onUpdateArrendatario: UpdateArrendatarioFn
  onUpdatePago: UpdatePagoFn
  onAddMes: () => void
  onAddArrendatario: (mes: string) => void
  onRemoveArrendatario: (id: number) => void
  servicios: ServicioPublico[]
  onUpdateServicio: UpdateServicioFn
  onAddServicio: () => void
  onRemoveServicio: (index: number) => void
  onSave: () => void
  saving: boolean
}) {
  const [mesFiltro, setMesFiltro] = useState(mesesCols[mesesCols.length - 1])

  const totalCanon = arrendatarios.reduce((sum, a) => sum + a.canon, 0)

  const handleAddMes = () => {
    onAddMes()
    setMesFiltro(nextMes(mesesCols[mesesCols.length - 1]))
  }

  const inputCls = 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const selectCls = `${inputCls} cursor-pointer`

  return (
    <div className="space-y-8">
      <SectionTitle icon="building">Edificio Cumbre</SectionTitle>

      <ServiciosPublicosCard servicios={servicios} onUpdate={onUpdateServicio} onAdd={onAddServicio} onRemove={onRemoveServicio} onSave={onSave} saving={saving} />

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="font-semibold text-gray-800 dark:text-white">Arriendos · {mesLabel(mesFiltro)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Edita apto, nombre, canon, notas y estado</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={mesFiltro}
                onChange={e => setMesFiltro(e.target.value)}
                className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {mesesCols.map((m: string) => <option key={m} value={m}>{mesLabel(m)}</option>)}
              </select>
              <button
                onClick={handleAddMes}
                className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" /> {mesLabel(nextMes(mesesCols[mesesCols.length - 1]))}
              </button>
              <button
                onClick={() => onAddArrendatario(mesFiltro)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" /> Agregar arrendatario
              </button>
              <SaveButton onSave={onSave} saving={saving} />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
              <tr>
                <Th>Apto</Th>
                <Th>Arrendatario</Th>
                <Th right>Canon</Th>
                <Th>Notas</Th>
                <Th center>Estado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {arrendatarios.map(a => {
                const pago = a.pagos.find(p => p.mes === mesFiltro)
                const estado = pago?.estado ?? 'pendiente'
                return (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-2">
                      <input type="text" value={a.apto}
                        onChange={e => onUpdateArrendatario(a.id, { apto: e.target.value })}
                        className={`${inputCls} w-20`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" value={a.nombre}
                        onChange={e => onUpdateArrendatario(a.id, { nombre: e.target.value })}
                        className={`${inputCls} w-44`} />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <MoneyInput value={a.canon} onChange={n => onUpdateArrendatario(a.id, { canon: n })} widthClass="w-32" />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" value={a.notas ?? ''}
                        placeholder="Notas…"
                        onChange={e => onUpdateArrendatario(a.id, { notas: e.target.value })}
                        className={`${inputCls} w-full min-w-[12rem]`} />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <select value={estado}
                        onChange={e => onUpdatePago(a.id, mesFiltro, { estado: e.target.value as PayStatus })}
                        className={`${selectCls} text-xs`}>
                        <option value="pagado">Pagado</option>
                        <option value="abono">Abono</option>
                        <option value="pendiente">Pendiente</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button onClick={() => onRemoveArrendatario(a.id)}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Eliminar arrendatario"><Icon name="x" className="w-4 h-4 mx-auto" /></button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 dark:border-gray-600">
              <tr className="bg-green-50 dark:bg-green-900/10">
                <td colSpan={2} className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">Total canon</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 dark:text-green-400 text-sm">{cop(totalCanon)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <ResumenPagosCard arrendatarios={arrendatarios} mesesCols={mesesCols} />
    </div>
  )
}

// ── Lote Card (editable) ──────────────────────────────────────
function LoteCard({ lote, anio, onUpdate, onRemove }: {
  lote: Lote
  anio: number
  onUpdate: (changes: Partial<Lote>) => void
  onRemove: () => void
}) {
  const [editing, setEditing] = useState(lote.nombre === '')
  const [draft, setDraft] = useState({ ...lote })

  const openEdit = () => { setDraft({ ...lote }); setEditing(true) }
  const save = () => { onUpdate(draft); setEditing(false) }
  const cancel = () => { if (lote.nombre === '') { onRemove(); return } setEditing(false) }

  const inputCls = 'w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1'

  // Predial values for the selected year (in the draft and the saved lote)
  const yKey = String(anio)
  const draftPred = draft.predialPorAnio?.[yKey] ?? { monto: 0, estado: 'pendiente' as PayStatus }
  const setDraftPred = (changes: Partial<LotePredial>) =>
    setDraft({ ...draft, predialPorAnio: { ...draft.predialPorAnio, [yKey]: { ...draftPred, ...changes } } })
  const shownPred = lotePredialDe(lote, anio)

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-2">
        <h4 className="font-semibold text-gray-800 dark:text-white text-sm truncate">
          {lote.nombre || <span className="text-gray-400 italic">Nuevo lote</span>}
        </h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {!editing && <Badge estado={shownPred.estado} />}
          {!editing ? (
            <>
              <button onClick={openEdit} title="Editar" className="text-blue-600 dark:text-blue-400 hover:text-blue-800 p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"><Icon name="pencil" className="w-4 h-4" /></button>
              <button onClick={onRemove} title="Eliminar" className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"><Icon name="x" className="w-4 h-4" /></button>
            </>
          ) : (
            <>
              <button onClick={save} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1 rounded transition-colors">Guardar</button>
              <button onClick={cancel} className="text-xs text-gray-500 dark:text-gray-400 font-medium px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="px-5 py-4 grid grid-cols-2 gap-x-4 gap-y-3">
          <div className="col-span-2">
            <label className={labelCls}>Nombre</label>
            <input type="text" className={inputCls} placeholder="Ej: Lote 1 · Sector Norte"
              value={draft.nombre} onChange={e => setDraft({ ...draft, nombre: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>N° escritura</label>
            <input type="text" className={inputCls} placeholder="Ej: Escritura 1234"
              value={draft.registro} onChange={e => setDraft({ ...draft, registro: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Metraje (m²)</label>
            <input type="number" className={inputCls} min={0}
              value={draft.metraje} onChange={e => setDraft({ ...draft, metraje: Number(e.target.value) })} />
          </div>
          <div>
            <label className={labelCls}>Avalúo catastral</label>
            <input type="number" className={inputCls} min={0} step={1_000_000}
              value={draft.avaluo} onChange={e => setDraft({ ...draft, avaluo: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-0.5">{cop(draft.avaluo)}</p>
          </div>
          <div>
            <label className={labelCls}>Predial {anio}</label>
            <input type="number" className={inputCls} min={0} step={10_000}
              value={draftPred.monto} onChange={e => setDraftPred({ monto: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-0.5">{cop(draftPred.monto)}</p>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Estado predial {anio}</label>
            <select className={inputCls} value={draftPred.estado}
              onChange={e => setDraftPred({ estado: e.target.value as PayStatus })}>
              <option value="pagado">Pagado</option>
              <option value="abono">Abono</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 grid grid-cols-2 gap-y-3 gap-x-6">
          <MiniStat label="N° escritura" value={lote.registro || '—'} />
          <MiniStat label="Metraje" value={`${lote.metraje} m²`} />
          <MiniStat label="Avalúo catastral" value={cop(lote.avaluo)} />
          <MiniStat label={`Predial ${anio}`} value={cop(shownPred.monto)} />
        </div>
      )}
    </div>
  )
}

// ── Section: Lotes ─────────────────────────────────────────────
function LotesBarichara({ lotes, addLote, removeLote, updateLote, anio, setAnio, onSave, saving }: {
  lotes: Lote[]
  addLote: () => void
  removeLote: (id: number) => void
  updateLote: (id: number, changes: Partial<Lote>) => void
  anio: number
  setAnio: (anio: number) => void
  onSave: () => void
  saving: boolean
}) {
  const predialTotal = lotes.reduce((s, l) => s + lotePredialDe(l, anio).monto, 0)
  const predialPendiente = lotes
    .filter(l => lotePredialDe(l, anio).estado !== 'pagado')
    .reduce((s, l) => s + lotePredialDe(l, anio).monto, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle icon="mountain">Lotes</SectionTitle>
        <div className="flex items-center gap-2 flex-wrap">
          <YearInput anio={anio} setAnio={setAnio} />
          <SaveButton onSave={onSave} saving={saving} />
          <button
            onClick={addLote}
            className="flex items-center gap-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" /> Agregar lote
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total lotes" value={String(lotes.length)} />
        <KpiCard label={`Predial total ${anio}`} value={cop(predialTotal)} />
        <KpiCard label="Predial pendiente" value={cop(predialPendiente)} valueClass="text-red-600 dark:text-red-400" />
      </div>

      {lotes.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-10 text-center text-gray-400 dark:text-gray-600 text-sm">
          Sin lotes — haz clic en "Agregar lote" para empezar
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {lotes.map(l => (
            <LoteCard
              key={l.id}
              lote={l}
              anio={anio}
              onUpdate={changes => updateLote(l.id, changes)}
              onRemove={() => removeLote(l.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// Single editable expense row (used by both gastos fijos and gastos del mes)
function GastoRow({ gasto, onChange, onRemove }: {
  gasto: GastoItem
  onChange: (changes: Partial<GastoItem>) => void
  onRemove: () => void
}) {
  const inputCls = 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  return (
    <div className="px-4 py-2.5 flex items-center gap-2">
      <input type="text" placeholder="Descripción" value={gasto.nombre}
        onChange={e => onChange({ nombre: e.target.value })}
        className={`${inputCls} flex-1 min-w-0`} />
      <MoneyInput value={gasto.monto} onChange={n => onChange({ monto: n })} widthClass="w-28" />
      <button onClick={onRemove} title="Eliminar"
        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0">
        <Icon name="x" className="w-4 h-4" />
      </button>
    </div>
  )
}

// ── Section: Finanzas ──────────────────────────────────────────
function Finanzas({
  arrendatarios,
  mesesCols,
  servicios,
  gastosVar,
  gastosFijos,
  serviciosUis,
  otrosGastosFijos,
  addGasto,
  removeGasto,
  updateGasto,
  addGastoFijo,
  removeGastoFijo,
  updateGastoFijo,
  onAddMes,
  onSave,
  saving,
}: {
  arrendatarios: Arrendatario[]
  mesesCols: string[]
  servicios: ServicioPublico[]
  gastosVar: Record<string, GastoItem[]>
  gastosFijos: GastoItem[]
  serviciosUis: ServicioPublico[]
  otrosGastosFijos: OtroGastoFijo[]
  addGasto: (mes: string) => void
  removeGasto: (mes: string, id: number) => void
  updateGasto: (mes: string, id: number, changes: Partial<GastoItem>) => void
  addGastoFijo: () => void
  removeGastoFijo: (id: number) => void
  updateGastoFijo: (id: number, changes: Partial<GastoItem>) => void
  onAddMes: () => void
  onSave: () => void
  saving: boolean
}) {
  const [mesFiltro, setMesFiltro] = useState(mesesCols[mesesCols.length - 1])

  const handleAddMes = () => {
    onAddMes()
    setMesFiltro(nextMes(mesesCols[mesesCols.length - 1]))
  }

  const gastosDelMes = gastosVar[mesFiltro] ?? []

  const totalRecibido = arrendatarios.reduce((sum, a) => sum + recibidoMes(a, mesFiltro), 0)

  // Servicios públicos Edificio Cumbre
  const totalServiciosCumbre = (servicios || []).reduce((sum: number, s: ServicioPublico) => sum + s.monto, 0)

  // Gastos internos (gastos_recurrentes y gastos_fijos por mes)
  const totalGastosFijos = gastosFijos.reduce((sum, g) => sum + g.monto, 0)
  const totalGastosMes = gastosDelMes.reduce((sum, g) => sum + g.monto, 0)

  // Gastos Apartamento UIS
  const totalServiciosUis = serviciosUis.reduce((sum, s) => sum + s.monto, 0)
  const totalOtrosGastosUis = otrosGastosFijos.reduce((sum, g) => sum + g.valor, 0)
  const totalGastosUis = totalServiciosUis + totalOtrosGastosUis

  // Total de gastos y saldo
  const totalGastos = totalServiciosCumbre + totalGastosFijos + totalGastosMes + totalGastosUis
  const saldo = totalRecibido - totalGastos

  const computedMeses = mesesCols.map((mes: string) => {
    const arriendos = arrendatarios.reduce((sum, a) => sum + recibidoMes(a, mes), 0)
    const gastosMesVar = (gastosVar[mes] ?? []).reduce((sum, g) => sum + g.monto, 0)
    const gastos = totalServiciosCumbre + totalGastosFijos + gastosMesVar + totalGastosUis
    return { mes, arriendos, gastosFijos: totalGastosFijos, gastosVar: gastosMesVar, gastos }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <SectionTitle icon="wallet">Finanzas</SectionTitle>
        <div className="flex items-center gap-2">
          <select
            value={mesFiltro}
            onChange={e => setMesFiltro(e.target.value)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
          >
            {mesesCols.map((m: string) => <option key={m} value={m}>{mesLabel(m)}</option>)}
          </select>
          <button
            onClick={handleAddMes}
            className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            <Icon name="plus" className="w-4 h-4" /> {mesLabel(nextMes(mesesCols[mesesCols.length - 1]))}
          </button>
        </div>
      </div>

      {/* KPI resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total recibido" value={cop(totalRecibido)} valueClass="text-green-600 dark:text-green-400" />
        <KpiCard label="Total gastos" value={cop(totalGastos)} valueClass="text-red-600 dark:text-red-400" />
        <KpiCard
          label="Saldo neto"
          value={cop(saldo)}
          valueClass={saldo >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}
        />
      </div>

      {/* Desglose de gastos por categoría */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <p className="font-semibold text-gray-800 dark:text-white">Servicios Edificio Cumbre</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Energía, agua, gas, internet, administración</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Servicios públicos</span>
              <span className="font-semibold text-gray-800 dark:text-white">{cop(totalServiciosCumbre)}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 dark:text-white">Total</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{cop(totalServiciosCumbre)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
            <p className="font-semibold text-gray-800 dark:text-white">Gastos Apartamento UIS</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Servicios públicos + otros gastos fijos</p>
          </div>
          <div className="px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Servicios públicos</span>
              <span className="font-semibold text-gray-800 dark:text-white">{cop(totalServiciosUis)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-700 dark:text-gray-300">Otros gastos fijos</span>
              <span className="font-semibold text-gray-800 dark:text-white">{cop(totalOtrosGastosUis)}</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-3 flex items-center justify-between">
              <span className="text-sm font-bold text-gray-800 dark:text-white">Total</span>
              <span className="font-bold text-blue-600 dark:text-blue-400">{cop(totalGastosUis)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gastos: fijos (todos los meses) + del mes, lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">

        {/* Gastos fijos */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800 dark:text-white">Gastos fijos</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Se repiten todos los meses</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={addGastoFijo}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" /> Agregar fijo
              </button>
              <SaveButton onSave={onSave} saving={saving} />
            </div>
          </div>

          {gastosFijos.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
              Sin gastos fijos — agrega los que pagas cada mes
            </div>
          ) : (
            <div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {gastosFijos.map(g => (
                  <GastoRow key={g.id} gasto={g} onChange={c => updateGastoFijo(g.id, c)} onRemove={() => removeGastoFijo(g.id)} />
                ))}
              </div>
              <div className="px-4 py-3 border-t-2 border-gray-200 dark:border-gray-600 bg-red-50 dark:bg-red-900/10 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total fijos</span>
                <span className="font-bold text-red-700 dark:text-red-400 text-sm">{cop(totalGastosFijos)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Gastos del mes */}
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center gap-3 flex-wrap">
            <div>
              <p className="font-semibold text-gray-800 dark:text-white">Gastos del mes · {mesLabel(mesFiltro)}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Solo de este mes</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => addGasto(mesFiltro)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
              >
                <Icon name="plus" className="w-4 h-4" /> Agregar gasto
              </button>
              <SaveButton onSave={onSave} saving={saving} />
            </div>
          </div>

          {gastosDelMes.length === 0 ? (
            <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
              Sin gastos este mes — haz clic en "Agregar gasto"
            </div>
          ) : (
            <div>
              <div className="divide-y divide-gray-100 dark:divide-gray-700">
                {gastosDelMes.map(g => (
                  <GastoRow key={g.id} gasto={g} onChange={c => updateGasto(mesFiltro, g.id, c)} onRemove={() => removeGasto(mesFiltro, g.id)} />
                ))}
              </div>
              <div className="px-4 py-3 border-t-2 border-gray-200 dark:border-gray-600 bg-red-50 dark:bg-red-900/10 flex justify-between items-center">
                <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total del mes</span>
                <span className="font-bold text-red-700 dark:text-red-400 text-sm">{cop(totalGastosMes)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resumen por mes — donas: cómo se reparte lo recibido */}
      <Card title="Resumen por mes">
        <div className="px-5 py-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">● Verde</span> saldo (lo que queda) ·
            <span className="text-amber-600 dark:text-amber-400 font-medium"> ● Ámbar</span> gastos fijos ·
            <span className="text-rose-600 dark:text-rose-400 font-medium"> ● Rojo</span> gastos del mes
          </p>
        </div>
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {[...computedMeses].reverse().map(m => {
            const saldoMes = m.arriendos - m.gastos
            const activo = m.mes === mesFiltro
            const segments = [
              { value: Math.max(saldoMes, 0), color: '#10b981' }, // saldo (verde)
              { value: m.gastosFijos,         color: '#f59e0b' }, // fijos (ámbar)
              { value: m.gastosVar,           color: '#f43f5e' }, // del mes (rojo)
            ]
            return (
              <div
                key={m.mes}
                onClick={() => setMesFiltro(m.mes)}
                className={`px-6 py-4 flex items-center gap-5 cursor-pointer transition-colors ${
                  activo ? 'bg-blue-50 dark:bg-blue-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                <DonutChart segments={segments}>
                  <div className="text-center leading-none">
                    <p className={`text-lg font-bold tracking-tight ${saldoMes >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                      {copCompact(saldoMes)}
                    </p>
                    <p className="text-[10px] font-medium text-gray-400 dark:text-gray-500 mt-0.5">saldo</p>
                  </div>
                </DonutChart>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-gray-800 dark:text-white text-sm mb-2">{mesLabel(m.mes)}</p>
                  <div className="space-y-1 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Recibido</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{cop(m.arriendos)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-amber-500" /> Gastos fijos</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{cop(m.gastosFijos)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400"><span className="w-2 h-2 rounded-full bg-rose-500" /> Gastos del mes</span>
                      <span className="font-semibold text-gray-700 dark:text-gray-300">{cop(m.gastosVar)}</span>
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
          {computedMeses.length === 0 && (
            <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">Sin meses registrados</div>
          )}
        </div>
      </Card>
    </div>
  )
}

// ── Shared UI primitives ───────────────────────────────────────
function Card({ title, accent, icon, children }: { title: string; accent?: string; icon?: IconName; children: React.ReactNode }) {
  const accentMap: Record<string, string> = {
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    blue:   'bg-brand-50 dark:bg-brand-500/10 text-brand-800 dark:text-brand-300 border-brand-100 dark:border-brand-500/20',
    red:    'bg-rose-50 dark:bg-rose-500/10 text-rose-800 dark:text-rose-300 border-rose-100 dark:border-rose-500/20',
  }
  const headerCls = accent ? accentMap[accent] : 'bg-slate-50 dark:bg-gray-700/40 text-slate-800 dark:text-white border-slate-200 dark:border-gray-700'
  return (
    <div className="bg-white dark:bg-gray-800/70 rounded-2xl shadow-card border border-slate-200/70 dark:border-white/5 overflow-hidden">
      <div className={`px-6 py-4 border-b font-semibold flex items-center gap-2.5 ${headerCls}`}>
        {icon && <Icon name={icon} className="w-[18px] h-[18px] shrink-0" />}
        {title}
      </div>
      {children}
    </div>
  )
}

function Th({ children, right, center }: { children?: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th className={`px-4 py-3 font-medium text-xs uppercase tracking-wide ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

function KpiCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="group bg-white dark:bg-gray-800/70 rounded-2xl shadow-card border border-slate-200/70 dark:border-white/5 p-5 transition-all hover:shadow-md hover:-translate-y-0.5">
      <p className="text-xs font-semibold text-slate-400 dark:text-gray-500 uppercase tracking-wide">{label}</p>
      <p className={`text-2xl font-bold mt-1.5 tracking-tight text-slate-800 dark:text-white ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mt-0.5">{value}</p>
    </div>
  )
}

// ── Section: Impuestos Prediales ──────────────────────────────
function ImpuestosPrediales({ lotes, anio, setAnio, updateLote, onSave, saving }: {
  lotes: Lote[]
  anio: number
  setAnio: (n: number) => void
  updateLote: (id: number, changes: Partial<Lote>) => void
  onSave: () => void
  saving: boolean
}) {
  const setEstado = (l: Lote, estado: PayStatus) => {
    const yKey = String(anio)
    const current = lotePredialDe(l, anio)
    updateLote(l.id, { predialPorAnio: { ...l.predialPorAnio, [yKey]: { ...current, estado } } })
  }

  const predialesAnio = lotes.map(l => lotePredialDe(l, anio))
  const totalDeuda = predialesAnio.filter(lp => lp.estado !== 'pagado').reduce((s, lp) => s + lp.monto, 0)
  const totalPagado = predialesAnio.filter(lp => lp.estado === 'pagado').reduce((s, lp) => s + lp.monto, 0)
  const totalGeneral = totalDeuda + totalPagado

  const selectCls = 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-xs text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <SectionTitle icon="landmark">Impuestos Prediales</SectionTitle>
        <div className="flex items-center gap-2">
          <YearInput anio={anio} setAnio={setAnio} />
          <SaveButton onSave={onSave} saving={saving} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={`Total predial ${anio}`} value={cop(totalGeneral)} />
        <KpiCard label="Ya pagado" value={cop(totalPagado)} valueClass="text-green-600 dark:text-green-400" />
        <KpiCard label="Por pagar" value={cop(totalDeuda)} valueClass="text-red-600 dark:text-red-400" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <span className="font-semibold text-gray-800 dark:text-white">Detalle por propiedad</span>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Cambia el estado y presiona Guardar para actualizar</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
              <tr>
                <Th>Propiedad</Th>
                <Th>Detalle</Th>
                <Th center>Estado</Th>
                <Th right>Monto</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {lotes.map(l => {
                const lp = lotePredialDe(l, anio)
                return (
                  <tr key={l.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{l.nombre || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">Año {anio}</td>
                    <td className="px-4 py-3 text-center">
                      <select value={lp.estado} onChange={e => setEstado(l, e.target.value as PayStatus)} className={selectCls}>
                        <option value="pagado">Pagado</option>
                        <option value="abono">Abono</option>
                        <option value="pendiente">Pendiente</option>
                      </select>
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold ${lp.estado !== 'pagado' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400 line-through'}`}>
                      {cop(lp.monto)}
                    </td>
                  </tr>
                )
              })}
              {lotes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
                    Sin lotes — agrégalos en la sección Lotes
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 dark:border-gray-600">
              <tr className="bg-red-50 dark:bg-red-900/10">
                <td colSpan={3} className="px-4 py-3 font-bold text-gray-700 dark:text-gray-300">Total por pagar</td>
                <td className="px-4 py-3 text-right font-bold text-red-700 dark:text-red-400">{cop(totalDeuda)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}

// ── Section: Contratos ────────────────────────────────────────
function Contratos() {
  const [files, setFiles] = useState<{ name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const BUCKET = 'contratos'

  const loadFiles = async () => {
    setLoading(true)
    const { data } = await supabase.storage.from(BUCKET).list('', { sortBy: { column: 'name', order: 'asc' } })
    if (data) setFiles(data.filter(f => f.name !== '.emptyFolderPlaceholder'))
    setLoading(false)
  }

  useEffect(() => { loadFiles() }, [])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.type !== 'application/pdf') { setUploadError('Solo se permiten archivos PDF'); return }
    setUploading(true)
    setUploadError(null)
    const { error } = await supabase.storage.from(BUCKET).upload(file.name, file, { upsert: true })
    if (error) setUploadError(error.message)
    else await loadFiles()
    setUploading(false)
    e.target.value = ''
  }

  const handleDelete = async (name: string) => {
    if (!confirm(`¿Eliminar "${name}"?`)) return
    await supabase.storage.from(BUCKET).remove([name])
    await loadFiles()
  }

  // Private bucket: generate a short-lived signed URL on demand
  const openFile = async (name: string, download = false) => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(name, 120, download ? { download: name } : undefined)
    if (error || !data) { alert('No se pudo abrir el archivo: ' + (error?.message ?? 'desconocido')); return }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-6">
      <SectionTitle icon="file">Contratos Cumbre</SectionTitle>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <p className="font-semibold text-gray-800 dark:text-white mb-4">Subir contrato (PDF)</p>
        <div className="flex items-center gap-4 flex-wrap">
          <label className={`flex items-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 text-white text-sm font-medium px-4 py-2 rounded-xl cursor-pointer shadow-sm hover:shadow-md transition-all ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
            {uploading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin inline-block" /> Subiendo…</>
              : <><Icon name="paperclip" className="w-4 h-4" /> Seleccionar PDF</>}
            <input type="file" accept="application/pdf" className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
          {uploadError && <p className="text-sm text-red-500">{uploadError}</p>}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <span className="font-semibold text-gray-800 dark:text-white">Contratos subidos</span>
        </div>
        {loading ? (
          <div className="px-6 py-8 text-center">
            <div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        ) : files.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
            Sin contratos — sube el primer PDF para empezar
          </div>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-700">
            {files.map(f => (
              <li key={f.name} className="px-6 py-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-brand-50 dark:bg-brand-500/10 text-brand-600 dark:text-brand-400">
                    <Icon name="file" className="w-5 h-5" />
                  </span>
                  <p className="text-sm font-medium text-gray-800 dark:text-white truncate">{f.name}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => openFile(f.name)}
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
                    <Icon name="eye" className="w-3.5 h-3.5" /> Ver
                  </button>
                  <button onClick={() => openFile(f.name, true)}
                    className="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-300 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors">
                    <Icon name="download" className="w-3.5 h-3.5" /> Descargar
                  </button>
                  <button onClick={() => handleDelete(f.name)}
                    className="inline-flex items-center gap-1.5 text-xs text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 font-medium px-3 py-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Icon name="x" className="w-3.5 h-3.5" /> Eliminar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ── Nav config ─────────────────────────────────────────────────
const navItems: { id: string; label: string; icon: IconName }[] = [
  { id: 'inicio',      label: 'Inicio',               icon: 'dashboard' },
  { id: 'bga',         label: 'Edificio Cumbre',      icon: 'building' },
  { id: 'apto-uis',    label: 'Apartamento UIS',      icon: 'home' },
  { id: 'finanzas',    label: 'Finanzas',             icon: 'wallet' },
  { id: 'barichara',   label: 'Lotes',                icon: 'mountain' },
  { id: 'prediales',   label: 'Impuestos Prediales',  icon: 'landmark' },
  { id: 'contratos',   label: 'Contratos Cumbre',     icon: 'file' },
]

// ── Login ──────────────────────────────────────────────────────
function Login({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const [email, setEmail] = useState('zamirpenaloza@gmail.com')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      setError(
        /confirm/i.test(error.message)
          ? 'Tu correo aún no está confirmado en Supabase.'
          : 'Correo o contraseña incorrectos.'
      )
      setLoading(false)
    }
    // On success, App's auth listener swaps to the dashboard.
  }

  const inputWrap = 'flex items-center gap-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-gray-800/60 px-3.5 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-500/20 transition'
  const inputCls = 'flex-1 bg-transparent py-3 text-sm text-slate-800 dark:text-white placeholder:text-slate-400 focus:outline-none'

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-slate-100 dark:bg-[#0a0f1d] bg-gradient-to-br from-slate-100 to-slate-200/60 dark:from-[#0a0f1d] dark:to-[#0d1424]">
      <button
        onClick={onToggleTheme}
        title={dark ? 'Modo claro' : 'Modo oscuro'}
        className="absolute top-5 right-5 p-2.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-white/5 transition-colors"
      >
        <Icon name={dark ? 'sun' : 'moon'} className="w-5 h-5" />
      </button>

      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-7">
          <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-white dark:ring-gray-700 shadow-glow mb-4 bg-brand-100 dark:bg-gray-800">
            <img src="/images/login-cumbre.jpg" alt="Cumbre" className="w-full h-full object-cover" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 dark:text-white">Panel Inmobiliario</h1>
          <p className="text-sm text-slate-500 dark:text-gray-400 mt-1">Ingresa para administrar tus propiedades</p>
        </div>

        <form
          onSubmit={submit}
          className="bg-white/90 dark:bg-gray-800/60 backdrop-blur-xl rounded-2xl shadow-card border border-slate-200/70 dark:border-white/5 p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Correo</label>
            <div className={inputWrap}>
              <Icon name="mail" className="w-[18px] h-[18px] text-slate-400 shrink-0" />
              <input
                type="email" autoComplete="email" required
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="tucorreo@ejemplo.com" className={inputCls}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 dark:text-gray-400 uppercase tracking-wide mb-1.5">Contraseña</label>
            <div className={inputWrap}>
              <Icon name="lock" className="w-[18px] h-[18px] text-slate-400 shrink-0" />
              <input
                type={showPass ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" className={inputCls}
              />
              <button
                type="button" onClick={() => setShowPass(s => !s)}
                title={showPass ? 'Ocultar' : 'Mostrar'}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 shrink-0 transition-colors"
              >
                <Icon name={showPass ? 'eyeOff' : 'eye'} className="w-[18px] h-[18px]" />
              </button>
            </div>
          </div>

          {error && (
            <p className="flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-500/10 rounded-lg px-3 py-2">
              <Icon name="x" className="w-4 h-4 shrink-0" /> {error}
            </p>
          )}

          <button
            type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-brand-500 to-brand-600 hover:from-brand-600 hover:to-brand-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold py-3 rounded-xl shadow-glow hover:shadow-md transition-all"
          >
            {loading
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Ingresando…</>
              : 'Ingresar'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-400 dark:text-gray-600 mt-5">Acceso privado · Solo personal autorizado</p>
      </div>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [dark, setDark] = useState(true)
  const [section, setSection] = useState('inicio')
  const [collapsed, setCollapsed] = useState(false)
  const [loadingDB, setLoadingDB] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>(INITIAL_ARRENDATARIOS)
  const [prediales, setPrediales] = useState<Predial[]>(INITIAL_PREDIALES)
  const [servicios, setServicios] = useState<ServicioPublico[]>(INITIAL_SERVICIOS)
  const [serviciosUis, setServiciosUis] = useState<ServicioPublico[]>([])
  const [lotes, setLotes] = useState<Lote[]>(INITIAL_LOTES)
  const [mesesCols, setMesesCols] = useState<string[]>(MESES_INICIALES)
  const [gastosVar, setGastosVar] = useState<Record<string, GastoItem[]>>({})
  const [gastosFijos, setGastosFijos] = useState<GastoItem[]>([])
  const [otrosGastosFijos, setOtrosGastosFijos] = useState<OtroGastoFijo[]>([])

  // Track the auth session (persisted by supabase-js in localStorage)
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setAuthChecked(true)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])

  // Load data once the user is authenticated
  useEffect(() => {
    if (!session) return
    setLoadingDB(true)
    loadFromDB().then(data => {
      if (data) {
        setArrendatarios(data.arrendatarios)
        setPrediales(data.prediales)
        setServicios(data.servicios)
        setServiciosUis(data.serviciosUis)
        setLotes(data.lotes)
        setMesesCols(data.mesesCols)
        setGastosVar(data.gastosVar)
        setGastosFijos(data.gastosFijos)
        setOtrosGastosFijos(data.otrosGastosFijos)
      }
      setLoadingDB(false)
    }).catch(() => setLoadingDB(false))
  }, [session])

  const handleLogout = () => supabase.auth.signOut()

  const handleRefresh = () => {
    setLoadingDB(true)
    loadFromDB().then(data => {
      if (data) {
        setArrendatarios(data.arrendatarios)
        setPrediales(data.prediales)
        setServicios(data.servicios)
        setServiciosUis(data.serviciosUis)
        setLotes(data.lotes)
        setMesesCols(data.mesesCols)
        setGastosVar(data.gastosVar)
        setGastosFijos(data.gastosFijos)
        setOtrosGastosFijos(data.otrosGastosFijos)
      }
      setLoadingDB(false)
    }).catch(() => setLoadingDB(false))
  }

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveToDB({ arrendatarios, prediales, servicios, serviciosUis, lotes, gastosVar, gastosFijos, otrosGastosFijos, mesesCols })
      setLastSaved(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }))
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const updateServicio: UpdateServicioFn = (index, changes) =>
    setServicios(prev => prev.map((s, i) => i === index ? { ...s, ...changes } : s))

  const updateArrendatario: UpdateArrendatarioFn = (id, changes) =>
    setArrendatarios(prev => prev.map(a => a.id === id ? { ...a, ...changes } : a))

  const updatePago: UpdatePagoFn = (arrendatarioId, mes, changes) =>
    setArrendatarios(prev => prev.map(a => {
      if (a.id !== arrendatarioId) return a
      const exists = a.pagos.some(p => p.mes === mes)
      if (exists) return { ...a, pagos: a.pagos.map(p => p.mes === mes ? { ...p, ...changes } : p) }
      return { ...a, pagos: [...a.pagos, { mes, estado: 'pendiente', valor: 0, ...changes }] }
    }))

  const addLote = () =>
    setLotes(prev => [...prev, { id: Date.now(), nombre: '', registro: '', avaluo: 0, metraje: 0, predialPorAnio: {} }])

  const removeLote = (id: number) =>
    setLotes(prev => prev.filter(l => l.id !== id))

  const updateLote = (id: number, changes: Partial<Lote>) =>
    setLotes(prev => prev.map(l => l.id === id ? { ...l, ...changes } : l))

  const addMes = () =>
    setMesesCols(prev => [...prev, nextMes(prev[prev.length - 1])])

  const addArrendatario = (mes: string) =>
    setArrendatarios(prev => [...prev, {
      id: Date.now(),
      apto: '',
      nombre: '',
      canon: 0,
      venceContrato: '',
      pagos: [{ mes, estado: 'pendiente' as PayStatus, valor: 0 }],
    }])

  const removeArrendatario = (id: number) =>
    setArrendatarios(prev => prev.filter(a => a.id !== id))

  const addGasto = (mes: string) =>
    setGastosVar(prev => ({ ...prev, [mes]: [...(prev[mes] ?? []), { id: Date.now(), nombre: '', monto: 0 }] }))

  const removeGasto = (mes: string, id: number) =>
    setGastosVar(prev => ({ ...prev, [mes]: (prev[mes] ?? []).filter(g => g.id !== id) }))

  const updateGasto = (mes: string, id: number, changes: Partial<GastoItem>) =>
    setGastosVar(prev => ({ ...prev, [mes]: (prev[mes] ?? []).map(g => g.id === id ? { ...g, ...changes } : g) }))

  const addGastoFijo = () =>
    setGastosFijos(prev => [...prev, { id: Date.now(), nombre: '', monto: 0 }])

  const removeGastoFijo = (id: number) =>
    setGastosFijos(prev => prev.filter(g => g.id !== id))

  const updateGastoFijo = (id: number, changes: Partial<GastoItem>) =>
    setGastosFijos(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g))

  const addOtroGastoFijo = () =>
    setOtrosGastosFijos(prev => [...prev, { id: Date.now(), nombre: '', valor: 0 }])

  const removeOtroGastoFijo = (id: number) =>
    setOtrosGastosFijos(prev => prev.filter(g => g.id !== id))

  const updateOtroGastoFijo = (id: number, changes: Partial<OtroGastoFijo>) =>
    setOtrosGastosFijos(prev => prev.map(g => g.id === id ? { ...g, ...changes } : g))

  const addServicio = () =>
    setServicios(prev => [...prev, { ...EMPTY_SERVICIO }])

  const removeServicio = (index: number) =>
    setServicios(prev => prev.filter((_, i) => i !== index))

  // Apartamento UIS — su propia lista de servicios públicos (recibos)
  const updateServicioUis: UpdateServicioFn = (index, changes) =>
    setServiciosUis(prev => prev.map((s, i) => i === index ? { ...s, ...changes } : s))
  const addServicioUis = () =>
    setServiciosUis(prev => [...prev, { ...EMPTY_SERVICIO }])
  const removeServicioUis = (index: number) =>
    setServiciosUis(prev => prev.filter((_, i) => i !== index))

  const anioPredial = prediales[0]?.anio ?? 2026
  const setAnioPredial = (anio: number) =>
    setPrediales(prev => prev.map(p => ({ ...p, anio })))

  const renderSection = () => {
    switch (section) {
      case 'inicio':     return <InicioAlertas arrendatarios={arrendatarios} servicios={servicios} lotes={lotes} mesesCols={mesesCols} gastosVar={gastosVar} gastosFijos={gastosFijos} anio={anioPredial} onNavigate={setSection} />
      case 'bga':        return <EdificioBGA arrendatarios={arrendatarios} mesesCols={mesesCols} onUpdateArrendatario={updateArrendatario} onUpdatePago={updatePago} onAddMes={addMes} onAddArrendatario={addArrendatario} onRemoveArrendatario={removeArrendatario} servicios={servicios} onUpdateServicio={updateServicio} onAddServicio={addServicio} onRemoveServicio={removeServicio} onSave={handleSave} saving={saving} />
      case 'apto-uis':   return <ApartamentoUis servicios={serviciosUis} onUpdate={updateServicioUis} onAdd={addServicioUis} onRemove={removeServicioUis} otrosGastos={otrosGastosFijos} onUpdateOtroGasto={updateOtroGastoFijo} onAddOtroGasto={addOtroGastoFijo} onRemoveOtroGasto={removeOtroGastoFijo} onSave={handleSave} saving={saving} />
      case 'barichara':  return <LotesBarichara lotes={lotes} addLote={addLote} removeLote={removeLote} updateLote={updateLote} anio={anioPredial} setAnio={setAnioPredial} onSave={handleSave} saving={saving} />
      case 'prediales':  return <ImpuestosPrediales lotes={lotes} anio={anioPredial} setAnio={setAnioPredial} updateLote={updateLote} onSave={handleSave} saving={saving} />
      case 'finanzas':   return (
        <Finanzas
          arrendatarios={arrendatarios}
          mesesCols={mesesCols}
          servicios={servicios}
          gastosVar={gastosVar}
          gastosFijos={gastosFijos}
          serviciosUis={serviciosUis}
          otrosGastosFijos={otrosGastosFijos}
          addGasto={addGasto}
          removeGasto={removeGasto}
          updateGasto={updateGasto}
          addGastoFijo={addGastoFijo}
          removeGastoFijo={removeGastoFijo}
          updateGastoFijo={updateGastoFijo}
          onAddMes={addMes}
          onSave={handleSave}
          saving={saving}
        />
      )
      case 'contratos':  return <Contratos />
      default: return null
    }
  }

  // Checking for an existing session
  if (!authChecked) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#0a0f1d]">
          <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  // Not logged in → show the login screen
  if (!session) {
    return (
      <div className={dark ? 'dark' : ''}>
        <Login dark={dark} onToggleTheme={() => setDark(d => !d)} />
      </div>
    )
  }

  if (loadingDB) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-[#0a0f1d]">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-brand-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-500 dark:text-gray-400 text-sm font-medium">Cargando datos desde Supabase…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen flex bg-slate-100 dark:bg-[#0a0f1d] bg-gradient-to-br from-slate-100 to-slate-200/60 dark:from-[#0a0f1d] dark:to-[#0d1424] transition-colors duration-200">

        <aside className={`${collapsed ? 'w-[72px]' : 'w-64'} shrink-0 flex flex-col bg-white/90 dark:bg-gray-800/60 backdrop-blur-xl border-r border-slate-200/80 dark:border-white/5 transition-all duration-300`}>
          <div className="flex items-center justify-between px-4 py-4 border-b border-slate-200/80 dark:border-white/5 min-h-[68px]">
            <div className="flex items-center gap-3 min-w-0">
              <div className="grid place-items-center w-10 h-10 shrink-0 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-glow">
                <Icon name="building" className="w-[22px] h-[22px]" strokeWidth={2} />
              </div>
              {!collapsed && (
                <div className="leading-tight min-w-0">
                  <p className="text-[10px] text-slate-400 dark:text-gray-500 uppercase tracking-[0.18em] font-semibold">Panel</p>
                  <p className="font-bold text-slate-800 dark:text-white text-sm truncate">Inmobiliaria</p>
                </div>
              )}
            </div>
            {!collapsed && (
              <button
                onClick={() => setCollapsed(c => !c)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
              >
                <Icon name="chevronLeft" className="w-4 h-4" strokeWidth={2.25} />
              </button>
            )}
          </div>

          {collapsed && (
            <button
              onClick={() => setCollapsed(false)}
              className="mx-auto mt-3 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-gray-200 hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors"
            >
              <Icon name="chevronRight" className="w-4 h-4" strokeWidth={2.25} />
            </button>
          )}

          <nav className="flex-1 py-3 space-y-1 px-2.5 overflow-hidden">
            {navItems.map(item => {
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 ${
                    active
                      ? 'bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-glow'
                      : 'text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-gray-100'
                  }`}
                >
                  <Icon name={item.icon} className="w-[18px] h-[18px] shrink-0" strokeWidth={active ? 2.1 : 1.85} />
                  {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
                </button>
              )
            })}
          </nav>

          <div className="px-2.5 py-3 border-t border-slate-200/80 dark:border-white/5 space-y-1">
            <button
              onClick={() => setDark(d => !d)}
              title={collapsed ? (dark ? 'Modo claro' : 'Modo oscuro') : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-800 dark:hover:text-gray-100 transition-colors"
            >
              <Icon name={dark ? 'sun' : 'moon'} className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="text-sm font-medium">{dark ? 'Modo claro' : 'Modo oscuro'}</span>}
            </button>
            <button
              onClick={handleLogout}
              title={collapsed ? 'Cerrar sesión' : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-500 dark:text-gray-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
            >
              <Icon name="logout" className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="text-sm font-medium">Cerrar sesión</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto">
            {section !== 'inicio' && (
              <div className="flex justify-end items-center gap-3 mb-5">
                {lastSaved && !saveError && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    <Icon name="check" className="w-4 h-4" /> Guardado a las {lastSaved}
                  </span>
                )}
                {saveError && (
                  <span className="text-xs text-red-500 font-medium">{saveError}</span>
                )}
                <button
                  onClick={handleRefresh}
                  disabled={loadingDB}
                  className="flex items-center gap-2 bg-white/80 dark:bg-gray-800/70 backdrop-blur border border-slate-200 dark:border-white/10 hover:border-brand-400 dark:hover:border-brand-500 text-slate-600 dark:text-gray-300 hover:text-brand-600 dark:hover:text-brand-400 text-sm font-medium px-4 py-2 rounded-xl shadow-sm transition-all disabled:opacity-60"
                >
                  <Icon name="refresh" className="w-4 h-4" /> Actualizar
                </button>
              </div>
            )}
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  )
}
