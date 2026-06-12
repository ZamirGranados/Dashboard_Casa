# 🏠 Dashboard Casa

Una aplicación web moderna para gestionar propiedades, arrendatarios, servicios públicos e impuestos prediales. Diseñada para simplificar la administración inmobiliaria con una interfaz intuitiva y funcionalidades completas.

## 🎯 Características

- **Gestión de Arrendatarios**: Registra, edita y monitorea contratos y pagos
- **Servicios Públicos**: Seguimiento de vencimientos (agua, luz, gas, internet, etc.)
- **Impuestos Prediales**: Control centralizado de prediales por propiedad
- **Finanzas**: Análisis de ingresos, gastos mensuales y KPIs
- **Gestión de Contratos**: Almacenamiento y descarga de PDFs
- **Modo Oscuro**: Interfaz adaptable con tema claro/oscuro
- **Sincronización en Tiempo Real**: Datos persistentes en Supabase

## 🛠 Stack Tecnológico

- **Frontend**: React 19 + TypeScript
- **Bundler**: Vite (desarrollo rápido con HMR)
- **Estilos**: Tailwind CSS v3
- **Base de Datos**: Supabase (PostgreSQL)
- **Gestión de Estado**: React Hooks
- **Linting**: ESLint + TypeScript ESLint

## 📦 Instalación

### Requisitos previos
- Node.js 18+
- npm o yarn

### Pasos

1. **Clonar el repositorio**
   ```bash
   git clone <repository-url>
   cd Dashboard_Casa
   ```

2. **Instalar dependencias**
   ```bash
   npm install
   ```

3. **Configurar variables de entorno**
   
   Crea un archivo `.env.local` en la raíz del proyecto con tus credenciales de Supabase:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Iniciar servidor de desarrollo**
   ```bash
   npm run dev
   ```
   
   La aplicación estará disponible en `http://localhost:5173`

## 🚀 Comandos disponibles

```bash
npm run dev        # Inicia servidor de desarrollo con HMR
npm run build      # Compila para producción
npm run preview    # Vista previa del build de producción
npm run lint       # Ejecuta ESLint
```

## 📚 Estructura del Proyecto

```
src/
├── App.tsx              # Componente principal (toda la app)
├── App.css              # Estilos mínimos
├── index.css            # Base de Tailwind
└── lib/
    └── supabase.ts      # Configuración de Supabase
```


## 📝 Licencia

Este proyecto está bajo la licencia MIT.

## 📧 Contacto

Para preguntas o soporte, contacta a: zamirpenaloza@gmail.com

---

**Última actualización**: Junio 2026
