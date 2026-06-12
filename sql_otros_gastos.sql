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
