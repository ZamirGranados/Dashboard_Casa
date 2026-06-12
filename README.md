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

## 🗂 Secciones Principales

| Sección | Descripción |
|---------|------------|
| **Inicio** | Alertas y tarjetas de navegación rápida |
| **Edificio BGA** | Servicios, arrendatarios y prediales del edificio |
| **Prediales** | Resumen centralizado de impuestos prediales |
| **Lotes Barichara** | Gestión de lotes y sus prediales |
| **Finanzas** | KPIs, gastos mensuales y análisis |
| **Contratos** | Upload, descarga y gestión de documentos PDF |

## 💾 Base de Datos (Supabase)

### Tablas necesarias
- `arrendatarios` - Información de arrendatarios
- `pagos` - Registro de pagos por arrendatario
- `prediales` - Impuestos prediales por entidad/año
- `servicios` - Servicios públicos y vencimientos
- `lotes` - Lotes y sus datos asociados
- `gastos_fijos` - Gastos mensuales

### Bucket de Almacenamiento
Se requiere un bucket público `contratos` en Supabase Storage para la sección de Contratos:

1. Ve a Supabase Dashboard → Storage
2. Crea un nuevo bucket con nombre `contratos`
3. Configúralo como **público**

> Si no configuras el bucket, la sección carga vacía pero no afecta el resto de la app.

## 🎨 Temas y Personalización

- **Dark Mode**: Está activado por defecto
- **Colores**: Basados en la paleta de Tailwind CSS
- **Responsive**: Completamente adaptable a dispositivos móviles

## 🔑 Convenciones del Código

- **Moneda**: Formateada automáticamente en COP (Colombia)
- **Fechas**: Formato `YYYY-MM-DD`
- **Clases CSS**: Siempre en pares dark (ej: `text-gray-800 dark:text-white`)
- **Inputs**: Totalmente controlados, sin librerías externas de formularios
- **Sin Context/Redux**: Todo el estado está centralizado en el componente `App`

## 🤝 Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
2. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
3. Push a la rama (`git push origin feature/AmazingFeature`)
4. Abre un Pull Request

## 📝 Licencia

Este proyecto está bajo la licencia MIT.

## 📧 Contacto

Para preguntas o soporte, contacta a: zamirpenaloza@gmail.com

---

**Última actualización**: Junio 2026
