-- Crear tabla para otros gastos fijos del Apartamento UIS
CREATE TABLE IF NOT EXISTS otros_gastos_uis (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  nombre TEXT NOT NULL,
  valor BIGINT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE otros_gastos_uis ENABLE ROW LEVEL SECURITY;

-- Crear política de acceso (sin restricciones para desarrollo)
CREATE POLICY "Allow all access to otros_gastos_uis" ON otros_gastos_uis
  FOR ALL USING (true);

-- Crear índice
CREATE INDEX IF NOT EXISTS idx_otros_gastos_uis_created_at ON otros_gastos_uis(created_at);
