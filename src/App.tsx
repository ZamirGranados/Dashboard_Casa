import { useState, useEffect } from 'react'
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
  pagos: { mes: string; estado: PayStatus; valor: number }[]
}

interface ServicioPublico {
  nombre: string
  diaVence: number
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

interface Lote {
  id: number
  nombre: string
  registro: string
  avaluo: number
  metraje: number
  predialEstado: PayStatus
  predialMonto: number
}

interface GastoItem {
  id: number
  nombre: string
  monto: number
}

type UpdatePredialFn = (entidad: string, changes: Partial<Predial>) => void
type UpdatePagoFn = (arrendatarioId: number, mes: string, changes: Partial<{ valor: number; estado: PayStatus }>) => void
type UpdateArrendatarioFn = (id: number, changes: Partial<Pick<Arrendatario, 'apto' | 'nombre' | 'canon'>>) => void
type UpdateServicioFn = (nombre: string, changes: Partial<ServicioPublico>) => void

// ── Initial data ───────────────────────────────────────────────
const IPC = 0.092
const TODAY = new Date('2026-05-29')

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
  { nombre: 'Energía',        diaVence: 15, monto: 850_000, estado: 'pendiente' },
  { nombre: 'Agua',           diaVence: 20, monto: 420_000, estado: 'pagado'    },
  { nombre: 'Gas',            diaVence: 10, monto: 180_000, estado: 'pagado'    },
  { nombre: 'Internet',       diaVence: 5,  monto: 95_000,  estado: 'pendiente' },
  { nombre: 'Administración', diaVence: 25, monto: 320_000, estado: 'pendiente' },
]

const INITIAL_PREDIALES: Predial[] = [
  { entidad: 'Edificio BGA',      anio: 2026, monto: 3_200_000, estado: 'pendiente', vencimiento: '2026-06-30' },
  { entidad: 'Casa Guane',        anio: 2026, monto: 1_800_000, estado: 'pagado',    vencimiento: '2026-04-30' },
  { entidad: 'Restaurante Guane', anio: 2026, monto: 980_000,   estado: 'pendiente', vencimiento: '2026-06-30' },
]

const INITIAL_LOTES: Lote[] = [
  { id: 1, nombre: 'Lote 1 · Sector Norte',  registro: 'R-2021-001', avaluo: 45_000_000, metraje: 500, predialEstado: 'pagado',    predialMonto: 350_000 },
  { id: 2, nombre: 'Lote 2 · Sector Sur',    registro: 'R-2021-002', avaluo: 38_000_000, metraje: 420, predialEstado: 'pendiente', predialMonto: 290_000 },
  { id: 3, nombre: 'Lote 3 · Vía Principal', registro: 'R-2022-005', avaluo: 62_000_000, metraje: 680, predialEstado: 'pendiente', predialMonto: 480_000 },
  { id: 4, nombre: 'Lote 4 · Esquinero',     registro: 'R-2022-008', avaluo: 55_000_000, metraje: 610, predialEstado: 'abono',     predialMonto: 400_000 },
]

// ── Helpers ────────────────────────────────────────────────────
const cop = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n)

const daysUntil = (dateStr: string) =>
  Math.ceil((new Date(dateStr).getTime() - TODAY.getTime()) / 86_400_000)

const mesLabel = (mes: string) => {
  const [y, m] = mes.split('-')
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${names[parseInt(m) - 1]} ${y}`
}

const nextMes = (mes: string) => {
  const [y, m] = mes.split('-').map(Number)
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
}

// ── DB: load ───────────────────────────────────────────────────
async function loadFromDB() {
  const [
    { data: arr }, { data: pag }, { data: pred },
    { data: serv }, { data: lot }, { data: gast },
  ] = await Promise.all([
    supabase.from('arrendatarios').select('*').order('created_at'),
    supabase.from('pagos').select('*'),
    supabase.from('prediales').select('*').order('created_at'),
    supabase.from('servicios').select('*').eq('inmueble', 'Edificio BGA').order('created_at'),
    supabase.from('lotes').select('*').order('created_at'),
    supabase.from('gastos_fijos').select('*').order('mes'),
  ])

  if (!arr?.length && !pred?.length && !serv?.length && !lot?.length) return null

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
    pagos: (pagosByArr[a.id] ?? []).map(p => ({
      mes: p.mes,
      valor: p.valor_pagado,
      estado: p.estado as PayStatus,
    })),
  }))

  const PREDIALES_ORDEN = ['Edificio BGA', 'Casa Guane', 'Restaurante Guane']
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

  const servicios: ServicioPublico[] = (serv ?? []).map(s => ({
    nombre: s.nombre,
    diaVence: s.dia_pago,
    monto: (s as { monto?: number }).monto ?? 0,
    estado: ((s as { estado?: string }).estado ?? 'pendiente') as PayStatus,
  }))

  const lotes: Lote[] = (lot ?? []).map((l, i) => ({
    id: i + 1,
    nombre: (l as { nombre?: string }).nombre ?? '',
    registro: l.numero_registro,
    avaluo: l.avaluo_catastral,
    metraje: l.metraje,
    predialEstado: ((l as { predial_estado?: string }).predial_estado ?? 'pendiente') as PayStatus,
    predialMonto: (l as { predial_monto?: number }).predial_monto ?? 0,
  }))

  const gastosVar: Record<string, GastoItem[]> = {}
  ;(gast ?? []).forEach((g, i) => {
    if (!gastosVar[g.mes]) gastosVar[g.mes] = []
    gastosVar[g.mes].push({ id: Date.now() + i, nombre: g.nombre, monto: g.valor })
  })

  const mesesSet = new Set<string>()
  pag?.forEach(p => mesesSet.add(p.mes))
  gast?.forEach(g => mesesSet.add(g.mes))
  const mesesCols = mesesSet.size > 0 ? Array.from(mesesSet).sort() : MESES_INICIALES

  return { arrendatarios, prediales, servicios, lotes, mesesCols, gastosVar }
}

// ── DB: save ───────────────────────────────────────────────────
async function saveToDB(state: {
  arrendatarios: Arrendatario[]
  prediales: Predial[]
  servicios: ServicioPublico[]
  lotes: Lote[]
  gastosVar: Record<string, GastoItem[]>
}) {
  const { arrendatarios, prediales, servicios, lotes, gastosVar } = state

  await supabase.from('pagos').delete().not('id', 'is', null)
  await supabase.from('arrendatarios').delete().not('id', 'is', null)

  if (arrendatarios.length > 0) {
    const { data: insertedArr } = await supabase
      .from('arrendatarios')
      .insert(arrendatarios.map(a => ({
        nombre: a.nombre || 'Sin nombre',
        apto: a.apto || 'Sin apto',
        canon_actual: a.canon,
        fecha_inicio: '2025-01-01',
        fecha_fin: a.venceContrato || '2026-12-31',
      })))
      .select('id, apto')

    if (insertedArr?.length) {
      const aptoToId: Record<string, string> = {}
      insertedArr.forEach(r => { aptoToId[r.apto] = r.id })

      const pagosRows = arrendatarios.flatMap(a => {
        const dbId = aptoToId[a.apto]
        if (!dbId) return []
        return a.pagos.map(p => ({
          arrendatario_id: dbId,
          mes: p.mes,
          valor_pagado: p.valor,
          estado: p.estado,
        }))
      })
      if (pagosRows.length > 0) await supabase.from('pagos').insert(pagosRows)
    }
  }

  await supabase.from('prediales').delete().not('id', 'is', null)
  if (prediales.length > 0) {
    await supabase.from('prediales').insert(prediales.map(p => ({
      inmueble: p.entidad,
      anio: p.anio,
      valor: p.monto,
      pagado: p.estado === 'pagado',
      fecha_limite: p.vencimiento || null,
    })))
  }

  await supabase.from('servicios').delete().eq('inmueble', 'Edificio BGA')
  if (servicios.length > 0) {
    await supabase.from('servicios').insert(servicios.map(s => ({
      nombre: s.nombre,
      dia_pago: s.diaVence,
      inmueble: 'Edificio BGA',
      ...(s.monto !== undefined ? { monto: s.monto } : {}),
      ...(s.estado !== undefined ? { estado: s.estado } : {}),
    })))
  }

  await supabase.from('lotes').delete().not('id', 'is', null)
  if (lotes.length > 0) {
    await supabase.from('lotes').insert(lotes.map(l => ({
      numero_registro: l.registro || 'Sin registro',
      avaluo_catastral: l.avaluo,
      metraje: l.metraje,
      ...(l.nombre !== undefined ? { nombre: l.nombre } : {}),
      ...(l.predialMonto !== undefined ? { predial_monto: l.predialMonto } : {}),
      ...(l.predialEstado !== undefined ? { predial_estado: l.predialEstado } : {}),
    })))
  }

  await supabase.from('gastos_fijos').delete().not('id', 'is', null)
  const gastosRows = Object.entries(gastosVar).flatMap(([mes, items]) =>
    items.filter(g => g.nombre).map(g => ({ nombre: g.nombre, valor: g.monto, mes }))
  )
  if (gastosRows.length > 0) await supabase.from('gastos_fijos').insert(gastosRows)
}

function Badge({ estado }: { estado: PayStatus }) {
  const cls: Record<PayStatus, string> = {
    pagado:    'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    abono:     'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300',
    pendiente: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
  }
  const label: Record<PayStatus, string> = { pagado: 'Pagado', abono: 'Abono', pendiente: 'Pendiente' }
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${cls[estado]}`}>
      {label[estado]}
    </span>
  )
}

// ── Section: Inicio / Alertas ──────────────────────────────────
function InicioAlertas({ prediales, arrendatarios, servicios }: { prediales: Predial[]; arrendatarios: Arrendatario[]; servicios: ServicioPublico[] }) {
  const contractAlerts = arrendatarios
    .map(a => ({ ...a, dias: daysUntil(a.venceContrato) }))
    .filter(a => a.dias <= 90)
    .sort((a, b) => a.dias - b.dias)

  const predialAlerts = prediales.filter(p => p.estado !== 'pagado')

  const todayDay = TODAY.getDate()
  const servicioAlerts = servicios
    .filter(s => s.estado !== 'pagado')
    .map(s => ({ ...s, diasRestantes: s.diaVence - todayDay }))
    .sort((a, b) => a.diasRestantes - b.diasRestantes)

  const noAlerts = contractAlerts.length === 0 && predialAlerts.length === 0 && servicioAlerts.length === 0

  const urgenciaTag = (dias: number) => {
    if (dias < 0)  return { text: 'Vencido',       cls: 'text-red-600 dark:text-red-400 font-bold' }
    if (dias === 0) return { text: '¡Hoy!',        cls: 'text-red-600 dark:text-red-400 font-bold' }
    if (dias <= 5)  return { text: `${dias} días ⚠️`, cls: 'text-red-600 dark:text-red-400 font-semibold' }
    if (dias <= 15) return { text: `${dias} días`,  cls: 'text-orange-500 font-semibold' }
    return              { text: `${dias} días`,     cls: 'text-gray-500 dark:text-gray-400' }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">🏠 Inicio / Alertas</h2>

      {noAlerts && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl p-8 text-center">
          <p className="text-green-700 dark:text-green-300 text-lg font-medium">
            ✅ Todo en orden — sin alertas pendientes
          </p>
        </div>
      )}

      {servicioAlerts.length > 0 && (
        <Card title="⚡ Servicios públicos — Edificio BGA" accent="blue">
          {servicioAlerts.map(s => {
            const { text, cls } = urgenciaTag(s.diasRestantes)
            const rowBg = s.diasRestantes <= 0
              ? 'bg-red-50 dark:bg-red-900/10'
              : s.diasRestantes <= 5
                ? 'bg-orange-50 dark:bg-orange-900/10'
                : ''
            return (
              <div key={s.nombre} className={`px-6 py-4 flex justify-between items-center border-b last:border-0 border-gray-100 dark:border-gray-700 ${rowBg}`}>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{s.nombre}</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Vence día {s.diaVence} del mes</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cop(s.monto)}</p>
                  <span className={`text-xs ${cls}`}>{text}</span>
                  <Badge estado={s.estado} />
                </div>
              </div>
            )
          })}
        </Card>
      )}

      {contractAlerts.length > 0 && (
        <Card title="⚠️ Contratos por vencer" accent="orange">
          {contractAlerts.map(a => (
            <div key={a.id} className="px-6 py-4 flex justify-between items-center border-b last:border-0 border-gray-100 dark:border-gray-700">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">Apto {a.apto} — {a.nombre}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Vence: {a.venceContrato}</p>
              </div>
              <span className={`text-sm font-bold ${a.dias <= 30 ? 'text-red-600 dark:text-red-400' : 'text-orange-500'}`}>
                {a.dias > 0 ? `${a.dias} días` : 'Vencido'}
              </span>
            </div>
          ))}
        </Card>
      )}

      {predialAlerts.length > 0 && (
        <Card title="🏛️ Prediales pendientes" accent="red">
          {predialAlerts.map(p => (
            <div key={p.entidad} className="px-6 py-4 flex justify-between items-center border-b last:border-0 border-gray-100 dark:border-gray-700">
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{p.entidad}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Vence: {p.vencimiento} · Año {p.anio}</p>
              </div>
              <div className="flex flex-col items-end gap-1">
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{cop(p.monto)}</p>
                <Badge estado={p.estado} />
              </div>
            </div>
          ))}
        </Card>
      )}
    </div>
  )
}

// ── Servicios públicos editable ────────────────────────────────
const EMPTY_SERVICIO: ServicioPublico = { nombre: '', diaVence: 1, monto: 0, estado: 'pendiente' }

function ServiciosPublicosCard({
  servicios, onUpdate, onAdd, onRemove,
}: {
  servicios: ServicioPublico[]
  onUpdate: UpdateServicioFn
  onAdd: (s: ServicioPublico) => void
  onRemove: (nombre: string) => void
}) {
  const [editingRow, setEditingRow] = useState<string | null>(null)
  const [draft, setDraft] = useState<ServicioPublico | null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [newDraft, setNewDraft] = useState<ServicioPublico>({ ...EMPTY_SERVICIO })
  const todayDay = TODAY.getDate()

  const inputCls = 'w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1'

  const openEdit = (s: ServicioPublico) => { setDraft({ ...s }); setEditingRow(s.nombre); setAddingNew(false) }
  const save = () => { if (draft) onUpdate(draft.nombre, draft); setEditingRow(null); setDraft(null) }
  const cancel = () => { setEditingRow(null); setDraft(null) }

  const saveNew = () => {
    if (!newDraft.nombre.trim()) return
    onAdd({ ...newDraft })
    setAddingNew(false)
    setNewDraft({ ...EMPTY_SERVICIO })
  }
  const cancelNew = () => { setAddingNew(false); setNewDraft({ ...EMPTY_SERVICIO }) }

  const EditForm = ({ d, setD, onSave, onCancel, isNew }: {
    d: ServicioPublico
    setD: (v: ServicioPublico) => void
    onSave: () => void
    onCancel: () => void
    isNew?: boolean
  }) => (
    <div className="px-6 py-4 bg-blue-50 dark:bg-blue-900/10">
      <div className="flex items-center justify-between mb-3">
        {isNew ? (
          <div className="flex-1 mr-4">
            <label className={labelCls}>Nombre del servicio</label>
            <input type="text" placeholder="Ej: Aseo" className={inputCls} value={d.nombre}
              onChange={e => setD({ ...d, nombre: e.target.value })} />
          </div>
        ) : (
          <p className="font-medium text-gray-900 dark:text-white">{d.nombre}</p>
        )}
        <div className="flex gap-2 shrink-0">
          <button onClick={onSave} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1 rounded transition-colors">Guardar</button>
          <button onClick={onCancel} className="text-xs text-gray-500 dark:text-gray-400 font-medium px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className={labelCls}>Día vence</label>
          <input type="number" min={1} max={31} className={inputCls} value={d.diaVence}
            onChange={e => setD({ ...d, diaVence: Number(e.target.value) })} />
        </div>
        <div>
          <label className={labelCls}>Estado</label>
          <select className={`${inputCls} cursor-pointer`} value={d.estado}
            onChange={e => setD({ ...d, estado: e.target.value as PayStatus })}>
            <option value="pagado">Pagado</option>
            <option value="pendiente">Pendiente</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Valor</label>
          <input type="number" min={0} step={1000} className={inputCls} value={d.monto}
            onChange={e => setD({ ...d, monto: Number(e.target.value) })} />
          <p className="text-xs text-gray-400 mt-0.5">{cop(d.monto)}</p>
        </div>
      </div>
    </div>
  )

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center">
        <span className="font-semibold text-gray-800 dark:text-white">Servicios públicos</span>
        <button
          onClick={() => { setAddingNew(true); setEditingRow(null); setDraft(null) }}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors"
        >
          + Agregar
        </button>
      </div>

      <div className="divide-y divide-gray-100 dark:divide-gray-700">
        {servicios.map(s => {
          const diasRestantes = s.diaVence - todayDay
          const vencido = s.estado !== 'pagado' && diasRestantes < 0
          const urgente = s.estado !== 'pagado' && !vencido && diasRestantes <= 5

          if (editingRow === s.nombre && draft) {
            return <EditForm key={s.nombre} d={draft} setD={setDraft} onSave={save} onCancel={cancel} />
          }

          return (
            <div key={s.nombre} className={`px-6 py-4 flex justify-between items-center ${vencido ? 'bg-red-50 dark:bg-red-900/10' : urgente ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">{s.nombre}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Vence día {s.diaVence}
                  {s.estado !== 'pagado' && (
                    <span className={`ml-2 font-semibold ${vencido || urgente ? 'text-red-600 dark:text-red-400' : 'text-orange-500'}`}>
                      ({vencido ? 'Vencido' : diasRestantes === 0 ? '¡Hoy!' : `${diasRestantes} días`})
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-semibold text-gray-700 dark:text-gray-300">{cop(s.monto)}</span>
                <Badge estado={s.estado} />
                <button onClick={() => openEdit(s)} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">✏️</button>
                <button onClick={() => onRemove(s.nombre)} className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">✕</button>
              </div>
            </div>
          )
        })}

        {addingNew && (
          <EditForm d={newDraft} setD={setNewDraft} onSave={saveNew} onCancel={cancelNew} isNew />
        )}

        {servicios.length === 0 && !addingNew && (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
            Sin servicios — haz clic en "+ Agregar" para empezar
          </div>
        )}
      </div>
    </div>
  )
}

// ── Section: Edificio BGA ──────────────────────────────────────
function EdificioBGA({
  arrendatarios,
  mesesCols,
  predialBGA,
  onUpdatePredial,
  servicios,
  onUpdateServicio,
  onAddServicio,
  onRemoveServicio,
}: {
  arrendatarios: Arrendatario[]
  mesesCols: string[]
  predialBGA: Predial
  onUpdatePredial: UpdatePredialFn
  servicios: ServicioPublico[]
  onUpdateServicio: UpdateServicioFn
  onAddServicio: (s: ServicioPublico) => void
  onRemoveServicio: (nombre: string) => void
}) {
  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">🏢 Edificio BGA</h2>

      <ServiciosPublicosCard servicios={servicios} onUpdate={onUpdateServicio} onAdd={onAddServicio} onRemove={onRemoveServicio} />

      <Card title="Arrendatarios · Canon e IPC">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400">
              <tr>
                <Th>Apto</Th>
                <Th>Arrendatario</Th>
                <Th right>Canon actual</Th>
                <Th right>Con IPC (9.2%)</Th>
                <Th center>Vence contrato</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {arrendatarios.map(a => {
                const dias = daysUntil(a.venceContrato)
                return (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.apto}</td>
                    <td className="px-4 py-3 text-gray-700 dark:text-gray-300">{a.nombre}</td>
                    <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{cop(a.canon)}</td>
                    <td className="px-4 py-3 text-right font-semibold text-blue-600 dark:text-blue-400">
                      {cop(Math.round(a.canon * (1 + IPC)))}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <p className="text-gray-600 dark:text-gray-400">{a.venceContrato}</p>
                      <p className={`text-xs font-semibold ${
                        dias <= 30 ? 'text-red-600 dark:text-red-400' :
                        dias <= 90 ? 'text-orange-500' : 'text-green-600 dark:text-green-400'
                      }`}>
                        {dias > 0 ? `${dias} días` : 'Vencido'}
                      </p>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Registro de pagos mensuales">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-600 dark:text-gray-400">
              <tr>
                <Th>Apto</Th>
                {mesesCols.map((m: string) => <Th key={m} center>{mesLabel(m)}</Th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {arrendatarios.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{a.apto}</td>
                  {mesesCols.map((m: string) => {
                    const pago = a.pagos.find(p => p.mes === m)
                    return (
                      <td key={m} className="px-4 py-3 text-center">
                        {pago ? <Badge estado={pago.estado} /> : <span className="text-gray-300 dark:text-gray-600">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <PredialCard predial={predialBGA} onUpdate={changes => onUpdatePredial(predialBGA.entidad, changes)} />
    </div>
  )
}

// ── Section: Predial simple (Casa / Restaurante) ───────────────
function PredialSection({ titulo, predial, onUpdatePredial }: {
  titulo: string
  predial: Predial
  onUpdatePredial: UpdatePredialFn
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">{titulo}</h2>
      <PredialCard predial={predial} onUpdate={changes => onUpdatePredial(predial.entidad, changes)} />
    </div>
  )
}

function PredialCard({ predial, onUpdate }: { predial: Predial; onUpdate: (changes: Partial<Predial>) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ monto: predial.monto, vencimiento: predial.vencimiento, estado: predial.estado })

  const openEdit = () => {
    setDraft({ monto: predial.monto, vencimiento: predial.vencimiento, estado: predial.estado })
    setEditing(true)
  }
  const save = () => { onUpdate(draft); setEditing(false) }
  const cancel = () => setEditing(false)

  const inputCls = 'w-full bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const labelCls = 'block text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1'

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center">
        <span className="font-semibold text-gray-800 dark:text-white">Predial anual</span>
        {!editing ? (
          <button onClick={openEdit} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">
            ✏️ Editar
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={save} className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-medium px-3 py-1 rounded transition-colors">Guardar</button>
            <button onClick={cancel} className="text-xs text-gray-500 dark:text-gray-400 font-medium px-3 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">Cancelar</button>
          </div>
        )}
      </div>

      {editing ? (
        <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-5">
          <div>
            <label className={labelCls}>Monto</label>
            <input type="number" className={inputCls} value={draft.monto} min={0} step={1000}
              onChange={e => setDraft({ ...draft, monto: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-1">{cop(draft.monto)}</p>
          </div>
          <div>
            <label className={labelCls}>Fecha de vencimiento</label>
            <input type="date" className={inputCls} value={draft.vencimiento}
              onChange={e => setDraft({ ...draft, vencimiento: e.target.value })} />
          </div>
          <div>
            <label className={labelCls}>Estado</label>
            <select className={inputCls} value={draft.estado}
              onChange={e => setDraft({ ...draft, estado: e.target.value as PayStatus })}>
              <option value="pagado">Pagado</option>
              <option value="abono">Abono</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="px-6 py-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <KpiBox label="Año" value={String(predial.anio)} />
          <KpiBox label="Monto" value={cop(predial.monto)} />
          <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
            <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">Estado</p>
            <Badge estado={predial.estado} />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">Vence: {predial.vencimiento}</p>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Lote Card (editable) ──────────────────────────────────────
function LoteCard({ lote, onUpdate, onRemove }: {
  lote: Lote
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-5 py-3.5 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center gap-2">
        <h4 className="font-semibold text-gray-800 dark:text-white text-sm truncate">
          {lote.nombre || <span className="text-gray-400 italic">Nuevo lote</span>}
        </h4>
        <div className="flex items-center gap-1.5 shrink-0">
          {!editing && <Badge estado={lote.predialEstado} />}
          {!editing ? (
            <>
              <button onClick={openEdit} className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 font-medium px-2 py-1 rounded hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors">✏️</button>
              <button onClick={onRemove} className="text-xs text-gray-400 hover:text-red-500 dark:hover:text-red-400 px-2 py-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">✕</button>
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
            <label className={labelCls}>Registro</label>
            <input type="text" className={inputCls} placeholder="R-2021-001"
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
            <label className={labelCls}>Predial 2026</label>
            <input type="number" className={inputCls} min={0} step={10_000}
              value={draft.predialMonto} onChange={e => setDraft({ ...draft, predialMonto: Number(e.target.value) })} />
            <p className="text-xs text-gray-400 mt-0.5">{cop(draft.predialMonto)}</p>
          </div>
          <div className="col-span-2">
            <label className={labelCls}>Estado predial</label>
            <select className={inputCls} value={draft.predialEstado}
              onChange={e => setDraft({ ...draft, predialEstado: e.target.value as PayStatus })}>
              <option value="pagado">Pagado</option>
              <option value="abono">Abono</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>
        </div>
      ) : (
        <div className="px-5 py-4 grid grid-cols-2 gap-y-3 gap-x-6">
          <MiniStat label="Registro" value={lote.registro || '—'} />
          <MiniStat label="Metraje" value={`${lote.metraje} m²`} />
          <MiniStat label="Avalúo catastral" value={cop(lote.avaluo)} />
          <MiniStat label="Predial 2026" value={cop(lote.predialMonto)} />
        </div>
      )}
    </div>
  )
}

// ── Section: Lotes Barichara ───────────────────────────────────
function LotesBarichara({ lotes, addLote, removeLote, updateLote }: {
  lotes: Lote[]
  addLote: () => void
  removeLote: (id: number) => void
  updateLote: (id: number, changes: Partial<Lote>) => void
}) {
  const predialTotal = lotes.reduce((s, l) => s + l.predialMonto, 0)
  const predialPendiente = lotes.filter(l => l.predialEstado !== 'pagado').reduce((s, l) => s + l.predialMonto, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">🌄 Lotes Barichara</h2>
        <button
          onClick={addLote}
          className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
        >
          + Agregar lote
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total lotes" value={String(lotes.length)} />
        <KpiCard label="Predial total 2026" value={cop(predialTotal)} />
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
              onUpdate={changes => updateLote(l.id, changes)}
              onRemove={() => removeLote(l.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Section: Finanzas ──────────────────────────────────────────
function Finanzas({
  arrendatarios,
  updatePago,
  updateArrendatario,
  mesesCols,
  addMes,
  addArrendatario,
  removeArrendatario,
  gastosVar,
  addGasto,
  removeGasto,
  updateGasto,
}: {
  arrendatarios: Arrendatario[]
  updatePago: UpdatePagoFn
  updateArrendatario: UpdateArrendatarioFn
  mesesCols: string[]
  addMes: () => void
  addArrendatario: (mes: string) => void
  removeArrendatario: (id: number) => void
  gastosVar: Record<string, GastoItem[]>
  addGasto: (mes: string) => void
  removeGasto: (mes: string, id: number) => void
  updateGasto: (mes: string, id: number, changes: Partial<GastoItem>) => void
}) {
  const [mesFiltro, setMesFiltro] = useState(mesesCols[mesesCols.length - 1])

  const gastosDelMes = gastosVar[mesFiltro] ?? []

  const totalRecibido = arrendatarios.reduce((sum, a) => {
    const pago = a.pagos.find(p => p.mes === mesFiltro)
    return sum + (pago?.valor ?? 0)
  }, 0)

  const totalGastos = gastosDelMes.reduce((sum, g) => sum + g.monto, 0)
  const saldo = totalRecibido - totalGastos

  const computedMeses = mesesCols.map((mes: string) => {
    const arriendos = arrendatarios.reduce((sum, a) => sum + (a.pagos.find(p => p.mes === mes)?.valor ?? 0), 0)
    const gastos = (gastosVar[mes] ?? []).reduce((sum, g) => sum + g.monto, 0)
    return { mes, arriendos, gastos }
  })
  const maxVal = Math.max(...computedMeses.map(m => m.arriendos), 1)

  const handleAddMes = () => {
    addMes()
    setMesFiltro(nextMes(mesesCols[mesesCols.length - 1]))
  }

  const inputCls = 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1.5 text-sm text-gray-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
  const selectCls = `${inputCls} cursor-pointer`

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-2xl font-bold text-gray-800 dark:text-white">💰 Finanzas</h2>
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
            title={`Agregar ${mesLabel(nextMes(mesesCols[mesesCols.length - 1]))}`}
            className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-blue-400 dark:hover:border-blue-500 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 text-sm font-medium px-3 py-2 rounded-lg transition-colors"
          >
            + {mesLabel(nextMes(mesesCols[mesesCols.length - 1]))}
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

      {/* Arriendos del mes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center">
          <div>
            <p className="font-semibold text-gray-800 dark:text-white">Arriendos · {mesLabel(mesFiltro)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Edita apto, nombre, canon, valor recibido y estado</p>
          </div>
          <button
            onClick={() => addArrendatario(mesFiltro)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            + Agregar arrendatario
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
              <tr>
                <Th>Apto</Th>
                <Th>Arrendatario</Th>
                <Th right>Canon</Th>
                <Th right>Valor recibido</Th>
                <Th center>Estado</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {arrendatarios.map(a => {
                const pago = a.pagos.find(p => p.mes === mesFiltro)
                const valor = pago?.valor ?? 0
                const estado = pago?.estado ?? 'pendiente'
                return (
                  <tr key={a.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/20 transition-colors">
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={a.apto}
                        onChange={e => updateArrendatario(a.id, { apto: e.target.value })}
                        className={`${inputCls} w-20`}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input
                        type="text"
                        value={a.nombre}
                        onChange={e => updateArrendatario(a.id, { nombre: e.target.value })}
                        className={`${inputCls} w-44`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={50000}
                        value={a.canon}
                        onChange={e => updateArrendatario(a.id, { canon: Math.max(0, Number(e.target.value)) })}
                        className={`${inputCls} w-32 text-right`}
                      />
                    </td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min={0}
                        step={50000}
                        value={valor}
                        onChange={e => updatePago(a.id, mesFiltro, { valor: Math.max(0, Number(e.target.value)) })}
                        className={`${inputCls} w-36 text-right`}
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <select
                        value={estado}
                        onChange={e => updatePago(a.id, mesFiltro, { estado: e.target.value as PayStatus })}
                        className={`${selectCls} text-xs`}
                      >
                        <option value="pagado">Pagado</option>
                        <option value="abono">Abono</option>
                        <option value="pendiente">Pendiente</option>
                      </select>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <button
                        onClick={() => removeArrendatario(a.id)}
                        className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20"
                        title="Eliminar arrendatario"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-200 dark:border-gray-600">
              <tr className="bg-green-50 dark:bg-green-900/10">
                <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-300">Total recibido</td>
                <td className="px-4 py-3 text-right font-bold text-green-700 dark:text-green-400 text-sm">{cop(totalRecibido)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Gastos del mes */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex justify-between items-center">
          <div>
            <p className="font-semibold text-gray-800 dark:text-white">Gastos · {mesLabel(mesFiltro)}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Agrega todos los gastos del mes</p>
          </div>
          <button
            onClick={() => addGasto(mesFiltro)}
            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium px-3 py-2 rounded-lg transition-colors"
          >
            + Agregar gasto
          </button>
        </div>

        {gastosDelMes.length === 0 ? (
          <div className="px-6 py-8 text-center text-gray-400 dark:text-gray-600 text-sm">
            Sin gastos registrados — haz clic en "Agregar gasto" para empezar
          </div>
        ) : (
          <div>
            <div className="divide-y divide-gray-100 dark:divide-gray-700">
              {gastosDelMes.map(g => (
                <div key={g.id} className="px-4 py-2.5 flex items-center gap-3">
                  <input
                    type="text"
                    placeholder="Descripción del gasto"
                    value={g.nombre}
                    onChange={e => updateGasto(mesFiltro, g.id, { nombre: e.target.value })}
                    className={`${inputCls} flex-1`}
                  />
                  <input
                    type="number"
                    placeholder="Monto"
                    min={0}
                    step={1000}
                    value={g.monto}
                    onChange={e => updateGasto(mesFiltro, g.id, { monto: Math.max(0, Number(e.target.value)) })}
                    className={`${inputCls} w-36 text-right`}
                  />
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-28 text-right shrink-0 hidden sm:block">
                    {cop(g.monto)}
                  </span>
                  <button
                    onClick={() => removeGasto(mesFiltro, g.id)}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 shrink-0"
                    title="Eliminar"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t-2 border-gray-200 dark:border-gray-600 bg-red-50 dark:bg-red-900/10 flex justify-between items-center">
              <span className="text-sm font-bold text-gray-700 dark:text-gray-300">Total gastos</span>
              <span className="font-bold text-red-700 dark:text-red-400 text-sm">{cop(totalGastos)}</span>
            </div>
          </div>
        )}
      </div>

      {/* Resumen por mes */}
      <Card title="Resumen por mes">
        <div className="p-6 space-y-5">
          {computedMeses.map(m => {
            const saldoMes = m.arriendos - m.gastos
            const pct = (v: number) => `${Math.round((v / maxVal) * 100)}%`
            const activo = m.mes === mesFiltro
            return (
              <div
                key={m.mes}
                onClick={() => setMesFiltro(m.mes)}
                className={`rounded-lg p-4 cursor-pointer transition-colors ${
                  activo
                    ? 'bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-300 dark:ring-blue-700'
                    : 'hover:bg-gray-50 dark:hover:bg-gray-700/30'
                }`}
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">{mesLabel(m.mes)}</span>
                  <span className={`text-sm font-bold ${saldoMes >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                    Saldo: {cop(saldoMes)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <BarRow label="Recibido" value={m.arriendos} pct={pct(m.arriendos)} color="bg-green-500" />
                  <BarRow label="Gastos"   value={m.gastos}    pct={pct(m.gastos)}    color="bg-red-400"   />
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

// ── Shared UI primitives ───────────────────────────────────────
function Card({ title, accent, children }: { title: string; accent?: string; children: React.ReactNode }) {
  const accentMap: Record<string, string> = {
    orange: 'bg-orange-50 dark:bg-orange-900/20 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-800',
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 border-blue-200 dark:border-blue-800',
    red:    'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800',
  }
  const headerCls = accent ? accentMap[accent] : 'bg-gray-50 dark:bg-gray-700/50 text-gray-800 dark:text-white border-gray-200 dark:border-gray-700'
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className={`px-6 py-4 border-b font-semibold ${headerCls}`}>{title}</div>
      {children}
    </div>
  )
}

function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return (
    <th className={`px-4 py-3 font-medium text-xs uppercase tracking-wide ${right ? 'text-right' : center ? 'text-center' : 'text-left'}`}>
      {children}
    </th>
  )
}

function KpiCard({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5">
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-1 text-gray-800 dark:text-white ${valueClass ?? ''}`}>{value}</p>
    </div>
  )
}

function KpiBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 text-center">
      <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-bold text-gray-800 dark:text-white">{value}</p>
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

function BarRow({ label, value, pct, color }: { label: string; value: number; pct: string; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 dark:text-gray-400 w-16 shrink-0">{label}</span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div className={`${color} h-2 rounded-full`} style={{ width: pct }} />
      </div>
      <span className="text-xs text-gray-600 dark:text-gray-400 w-28 text-right shrink-0">{cop(value)}</span>
    </div>
  )
}

// ── Section: Impuestos Prediales ──────────────────────────────
function ImpuestosPrediales({ prediales, lotes }: { prediales: Predial[]; lotes: Lote[] }) {
  const propiedadRows = prediales.map(p => ({
    nombre: p.entidad,
    detalle: `Vence: ${p.vencimiento} · Año ${p.anio}`,
    monto: p.monto,
    estado: p.estado,
  }))

  const loteRows = lotes.map(l => ({
    nombre: l.nombre || '—',
    detalle: `Año 2026`,
    monto: l.predialMonto,
    estado: l.predialEstado,
  }))

  const totalDeuda = [...propiedadRows, ...loteRows]
    .filter(r => r.estado !== 'pagado')
    .reduce((s, r) => s + r.monto, 0)

  const totalPagado = [...propiedadRows, ...loteRows]
    .filter(r => r.estado === 'pagado')
    .reduce((s, r) => s + r.monto, 0)

  const totalGeneral = totalDeuda + totalPagado

  const RowGroup = ({ titulo, rows }: { titulo: string; rows: typeof propiedadRows }) => (
    <>
      <tr className="bg-gray-100 dark:bg-gray-700/60">
        <td colSpan={4} className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider">{titulo}</td>
      </tr>
      {rows.map((r, i) => (
        <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
          <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{r.nombre}</td>
          <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">{r.detalle}</td>
          <td className="px-4 py-3 text-center"><Badge estado={r.estado} /></td>
          <td className={`px-4 py-3 text-right font-semibold ${r.estado !== 'pagado' ? 'text-red-600 dark:text-red-400' : 'text-gray-500 dark:text-gray-400 line-through'}`}>
            {cop(r.monto)}
          </td>
        </tr>
      ))}
    </>
  )

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 dark:text-white">🏛️ Impuestos Prediales</h2>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label="Total predial 2026" value={cop(totalGeneral)} />
        <KpiCard label="Ya pagado" value={cop(totalPagado)} valueClass="text-green-600 dark:text-green-400" />
        <KpiCard label="Por pagar" value={cop(totalDeuda)} valueClass="text-red-600 dark:text-red-400" />
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
          <span className="font-semibold text-gray-800 dark:text-white">Detalle por propiedad</span>
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
              <RowGroup titulo="Propiedades" rows={propiedadRows} />
              {loteRows.length > 0 && <RowGroup titulo="Lotes Barichara" rows={loteRows} />}
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

// ── Nav config ─────────────────────────────────────────────────
const navItems = [
  { id: 'inicio',      label: 'Inicio / Alertas',    icon: '🏠' },
  { id: 'bga',         label: 'Edificio BGA',         icon: '🏢' },
  { id: 'guane-casa',  label: 'Casa Guane',           icon: '🏡' },
  { id: 'guane-rest',  label: 'Restaurante Guane',    icon: '🍽️' },
  { id: 'barichara',   label: 'Lotes Barichara',      icon: '🌄' },
  { id: 'finanzas',    label: 'Finanzas',             icon: '💰' },
  { id: 'prediales',   label: 'Impuestos Prediales',  icon: '🏛️' },
]

// ── App ────────────────────────────────────────────────────────
export default function App() {
  const [dark, setDark] = useState(false)
  const [section, setSection] = useState('inicio')
  const [collapsed, setCollapsed] = useState(false)
  const [loadingDB, setLoadingDB] = useState(true)
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)

  const [arrendatarios, setArrendatarios] = useState<Arrendatario[]>(INITIAL_ARRENDATARIOS)
  const [prediales, setPrediales] = useState<Predial[]>(INITIAL_PREDIALES)
  const [servicios, setServicios] = useState<ServicioPublico[]>(INITIAL_SERVICIOS)
  const [lotes, setLotes] = useState<Lote[]>(INITIAL_LOTES)
  const [mesesCols, setMesesCols] = useState<string[]>(MESES_INICIALES)
  const [gastosVar, setGastosVar] = useState<Record<string, GastoItem[]>>({})

  useEffect(() => {
    loadFromDB().then(data => {
      if (data) {
        setArrendatarios(data.arrendatarios)
        setPrediales(data.prediales)
        setServicios(data.servicios)
        setLotes(data.lotes)
        setMesesCols(data.mesesCols)
        setGastosVar(data.gastosVar)
      }
      setLoadingDB(false)
    }).catch(() => setLoadingDB(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      await saveToDB({ arrendatarios, prediales, servicios, lotes, gastosVar })
      setLastSaved(new Date().toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }))
    } catch {
      setSaveError('Error al guardar — revisa la consola')
    } finally {
      setSaving(false)
    }
  }

  const updatePredial: UpdatePredialFn = (entidad, changes) =>
    setPrediales(prev => prev.map(p => p.entidad === entidad ? { ...p, ...changes } : p))

  const updateServicio: UpdateServicioFn = (nombre, changes) =>
    setServicios(prev => prev.map(s => s.nombre === nombre ? { ...s, ...changes } : s))

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
    setLotes(prev => [...prev, { id: Date.now(), nombre: '', registro: '', avaluo: 0, metraje: 0, predialEstado: 'pendiente', predialMonto: 0 }])

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

  const addServicio = (s: ServicioPublico) =>
    setServicios(prev => [...prev, s])

  const removeServicio = (nombre: string) =>
    setServicios(prev => prev.filter(s => s.nombre !== nombre))

  const renderSection = () => {
    switch (section) {
      case 'inicio':     return <InicioAlertas prediales={prediales} arrendatarios={arrendatarios} servicios={servicios} />
      case 'bga':        return <EdificioBGA arrendatarios={arrendatarios} mesesCols={mesesCols} predialBGA={prediales[0]} onUpdatePredial={updatePredial} servicios={servicios} onUpdateServicio={updateServicio} onAddServicio={addServicio} onRemoveServicio={removeServicio} />
      case 'guane-casa': return <PredialSection titulo="🏡 Casa Guane" predial={prediales[1]} onUpdatePredial={updatePredial} />
      case 'guane-rest': return <PredialSection titulo="🍽️ Restaurante Guane" predial={prediales[2]} onUpdatePredial={updatePredial} />
      case 'barichara':  return <LotesBarichara lotes={lotes} addLote={addLote} removeLote={removeLote} updateLote={updateLote} />
      case 'prediales':  return <ImpuestosPrediales prediales={prediales} lotes={lotes} />
      case 'finanzas':   return (
        <Finanzas
          arrendatarios={arrendatarios}
          updatePago={updatePago}
          updateArrendatario={updateArrendatario}
          mesesCols={mesesCols}
          addMes={addMes}
          addArrendatario={addArrendatario}
          removeArrendatario={removeArrendatario}
          gastosVar={gastosVar}
          addGasto={addGasto}
          removeGasto={removeGasto}
          updateGasto={updateGasto}
        />
      )
      default: return null
    }
  }

  if (loadingDB) {
    return (
      <div className={dark ? 'dark' : ''}>
        <div className="min-h-screen flex items-center justify-center bg-gray-100 dark:bg-gray-900">
          <div className="text-center space-y-3">
            <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-gray-500 dark:text-gray-400 text-sm font-medium">Cargando datos desde Supabase…</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen flex bg-gray-100 dark:bg-gray-900 transition-colors duration-200">

        <aside className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 flex flex-col bg-white dark:bg-gray-800 shadow-md transition-all duration-300`}>
          <div className="flex items-center justify-between px-4 py-5 border-b border-gray-200 dark:border-gray-700 min-h-[68px]">
            {!collapsed && (
              <div className="leading-tight">
                <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-widest">Panel</p>
                <p className="font-bold text-gray-800 dark:text-white text-sm">Inmobiliaria</p>
              </div>
            )}
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {collapsed ? '→' : '←'}
            </button>
          </div>

          <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-hidden">
            {navItems.map(item => (
              <button
                key={item.id}
                onClick={() => setSection(item.id)}
                title={collapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                  section === item.id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                <span className="text-base shrink-0">{item.icon}</span>
                {!collapsed && <span className="text-sm font-medium truncate">{item.label}</span>}
              </button>
            ))}
          </nav>

          <div className="px-2 py-3 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setDark(d => !d)}
              title={collapsed ? (dark ? 'Modo claro' : 'Modo oscuro') : undefined}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <span className="text-base shrink-0">{dark ? '☀️' : '🌙'}</span>
              {!collapsed && <span className="text-sm font-medium">{dark ? 'Modo claro' : 'Modo oscuro'}</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 p-6 overflow-auto">
          <div className="max-w-5xl mx-auto">
            <div className="flex justify-end items-center gap-3 mb-5">
              {lastSaved && !saveError && (
                <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                  ✅ Guardado a las {lastSaved}
                </span>
              )}
              {saveError && (
                <span className="text-xs text-red-500 font-medium">{saveError}</span>
              )}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-sm transition-colors"
              >
                {saving
                  ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Guardando…</>
                  : '💾 Guardar en Supabase'
                }
              </button>
            </div>
            {renderSection()}
          </div>
        </main>
      </div>
    </div>
  )
}
