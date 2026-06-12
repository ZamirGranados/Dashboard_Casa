# Dashboard Casa — CLAUDE.md

## Stack
- React 19 + TypeScript, bundled with Vite
- Tailwind CSS v3 (`darkMode: 'class'` strategy)
- Supabase (PostgreSQL) for persistence
- No routing — single-page SPA, section managed via `section` state string

## Project structure
```
src/App.tsx        ← toda la aplicación (un solo archivo)
src/lib/supabase.ts
src/index.css      ← Tailwind base
src/App.css        ← estilos mínimos
```

## Arquitectura
- **Estado**: todo en `App` con `useState`. Sin context ni store externo.
- **Dark mode**: `const [dark, setDark] = useState(true)` en App. El div raíz recibe `className={dark ? 'dark' : ''}`.
- **Datos**: `loadFromDB()` al montar → estado. `saveToDB()` al hacer clic en "Guardar".
- **Navegación**: `renderSection()` hace switch sobre `section`.

## Secciones
| id | Componente | Descripción |
|----|------------|-------------|
| inicio | InicioAlertas | Alertas (servicios BGA + prediales) + tarjetas de navegación |
| bga | EdificioBGA | Servicios, arrendatarios (con fecha contrato editable), pagos, predial |
| guane-casa | PredialSection | Predial Casa Guane |
| guane-rest | PredialSection | Predial Restaurante Guane |
| barichara | LotesBarichara | Lotes con predial por lote |
| finanzas | Finanzas | KPIs + gastos por mes + resumen mensual |
| prediales | ImpuestosPrediales | Resumen total de prediales |
| contratos | Contratos | Upload/listado/descarga/eliminación de PDFs vía Supabase Storage |

## Tipos clave
- `Arrendatario`: arrendatario con array `pagos[]`
- `ServicioPublico`: servicio con día de vencimiento y estado
- `Predial`: impuesto predial por entidad/año
- `Lote`: lote con su propio predial
- `GastoItem`: línea de gasto mensual
- `PayStatus`: `'pagado' | 'abono' | 'pendiente'`

## Tablas Supabase
`arrendatarios`, `pagos`, `prediales`, `servicios`, `lotes`, `gastos_fijos`

## Supabase Storage
- Bucket `contratos` (público) — requerido para la sección Contratos
- Crear en Supabase dashboard → Storage → New bucket → nombre `contratos`, Public: ON
- Sin bucket, la sección carga vacía pero no rompe la app

## Convenciones
- Moneda: `cop(n)` → Intl, es-CO, COP
- Fechas: strings `YYYY-MM-DD`; `daysUntil()` calcula días desde `TODAY` (constante hardcodeada)
- Clases dark siempre en par: `text-gray-800 dark:text-white`
- Todos los inputs son controlados; sin librería de formularios
- `UpdateArrendatarioFn` acepta `apto | nombre | canon | venceContrato`

## Correr el proyecto
```bash
npm run dev      # servidor de desarrollo en localhost:5173
npm run build    # build de producción
npm run preview  # previsualizar build
```
