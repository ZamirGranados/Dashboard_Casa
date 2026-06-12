# Guía de Instalación: Otros Gastos Fijos

## ¿Qué se agregó?

Se ha añadido una nueva sección **"Otros gastos fijos"** en el apartado del **Edificio Cumbre** que permite:
- ✅ Agregar gastos adicionales (mantenimiento, seguros, etc.)
- ✅ Editar nombres y montos
- ✅ Eliminar gastos
- ✅ Guardar cambios en Supabase

## Pasos para configurar

### 1. **Ejecutar el SQL en Supabase**

Abre tu dashboard de Supabase y ve a:
- **SQL Editor** (en el menú izquierdo)
- **New Query**

Copia y pega el contenido del archivo `sql_otros_gastos.sql` y ejecuta (clic en el botón **Run**).

```sql
-- Crear tabla para otros gastos fijos del Edificio Cumbre
CREATE TABLE IF NOT EXISTS otros_gastos_fijos (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nombre TEXT NOT NULL,
  valor BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE otros_gastos_fijos ENABLE ROW LEVEL SECURITY;

-- Crear políticas de acceso (sin restricciones para desarrollo)
CREATE POLICY "Allow all access to otros_gastos_fijos" ON otros_gastos_fijos
  FOR ALL USING (true);

-- Crear índices
CREATE INDEX IF NOT EXISTS idx_otros_gastos_fijos_created_at ON otros_gastos_fijos(created_at);
```

### 2. **Verificar la tabla**

Una vez ejecutado el SQL, ve a:
- **Tables** (en el menú izquierdo)
- Verifica que aparezca `otros_gastos_fijos` con las columnas: `id`, `nombre`, `valor`, `created_at`, `updated_at`

### 3. **Usar la funcionalidad**

1. Inicia la app con `npm run dev`
2. Ve a **Edificio Cumbre** (en las tarjetas de navegación)
3. Verás:
   - **Servicios públicos** (arriba)
   - **Otros gastos fijos** (nuevo, abajo)
4. Haz clic en **"Agregar gasto"** para añadir un nuevo gasto
5. Completa el concepto y monto
6. Haz clic en **"Guardar"** para persostir los cambios

## Características de la interfaz

| Acción | Cómo hacerlo |
|--------|------------|
| **Agregar gasto** | Botón azul "+ Agregar gasto" en la parte superior |
| **Editar nombre/monto** | Haz clic en cualquier campo y escribe |
| **Eliminar gasto** | Botón rojo "✕" al final de cada fila |
| **Guardar** | Botón "Guardar" (verde) en la parte superior |

## Ejemplos de gastos

- Seguro del edificio: $500.000/mes
- Mantenimiento ascensor: $300.000/mes
- Vigilancia adicional: $200.000/mes
- Reparaciones comunes: variable

## Cómo se guardan los datos

Los datos se guardan en la tabla `otros_gastos_fijos` de Supabase cuando:
1. Haces clic en el botón **"Guardar"**
2. Se elimina toda la data anterior y se inserta la nueva (para mantener consistencia)
3. Aparece el timestamp del último guardado en la parte superior derecha

## Notas técnicas

- La tabla usa auto-increment (`GENERATED ALWAYS AS IDENTITY`) para los IDs
- Los montos se guardan como números enteros (COP sin decimales)
- RLS está habilitado pero permite acceso total (configurable según seguridad necesaria)
- Los cambios se recargan cada vez que haces clic en "Guardar"

## Si algo falla

1. **Error "tabla no existe"**: Verifica que ejecutaste el SQL correctamente
2. **No se guardan los datos**: Verifica que Supabase tenga la tabla y que estés autenticado
3. **No aparecen los gastos al recargar**: Haz clic en el botón de refresh (arriba a la derecha)

---

¡Listo! Ya puedes usar los otros gastos fijos en tu dashboard. 🎉
