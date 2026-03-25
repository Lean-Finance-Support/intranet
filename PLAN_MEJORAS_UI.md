# Plan de Mejoras Estéticas — Intranet LeanFinance

> Documento de referencia para implementación incremental.
> Cada fase es independiente y se puede implementar por separado.
> Respetar siempre la identidad visual actual: teal (#00B0B7), navy (#0B1333), Lato, cards blancas redondeadas.

## Leyenda
- ✅ Implementado y verificado
- 🔧 Implementado con ajuste posterior
- ⬜ Pendiente

---

## Estado actual (resumen)

### Tokens de diseño existentes
- **brand-teal**: `#00B0B7` — acento principal, CTAs
- **brand-navy**: `#0B1333` — textos, fondo admin
- **surface-gray**: `#F9FAFB` — fondo client
- **text-body**: `#333333` — texto principal
- **text-muted**: `#54595F` — texto secundario
- **Tipografía**: Lato (body), Carmen Sans (headings)

### Patrones visuales actuales
- Cards: `bg-white rounded-2xl shadow-sm border border-gray-100 p-6` (client) / `shadow-lg` (admin)
- Inputs: `border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-brand-teal/30`
- Botones primarios: `bg-brand-teal text-white rounded-lg hover:bg-brand-teal/90`
- Botones secundarios: `border border-gray-200 rounded-lg hover:bg-gray-50`
- Floating UI: botones circulares `w-10 h-10 rounded-full bg-white/90 backdrop-blur` en posición fija

### Dependencias actuales (package.json)
- Next.js 15, React 19, Tailwind CSS 4, Supabase SSR
- **NO** tiene: Framer Motion, shadcn/ui, Lucide React, TanStack Table

---

## Fase 1 — Login + Dashboard (primera impresión) ✅ COMPLETADA

**Objetivo**: Elevar la calidad visual de las dos pantallas que todo usuario ve al entrar.

### 1.1 Animaciones de entrada en Login ✅

**Archivos**: `app/app/login/page.tsx`, `app/admin/login/page.tsx`

Añadir animación CSS de entrada a la card de login (sin necesidad de Framer Motion):

```css
/* globals.css — añadir */
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.5s ease-out both;
}
```

- Aplicar `animate-fade-in-up` al contenedor principal de la card
- Aplicar con `animation-delay` escalonado al logo (0ms), título (100ms), botones (200ms), footer (300ms)
- Usar clases utility con delays: `.delay-100 { animation-delay: 100ms }` etc.

### 1.2 Hover mejorado en botones OAuth 🔧

**Archivos**: `app/app/login/page.tsx`, `app/admin/login/page.tsx`

Implementado inicialmente con elevación (`hover:shadow-md hover:-translate-y-0.5`).
Revertido: el botón de Google usa el SDK GIS (iframe con estilos propios), que no es compatible
con el wrapper de elevación. Decisión final: ambos botones usan solo `hover:bg-gray-50`
— sutil y consistente con el estilo de Google que no permite modificar su botón.

Estado actual:
```
border border-gray-200 rounded-xl px-5 py-3.5
hover:bg-gray-50 transition-colors duration-200
```

### 1.3 Acento visual mejorado ✅

**Archivos**: `app/app/login/page.tsx`, `app/admin/login/page.tsx`

Actual: barra teal `w-10 h-1 bg-brand-teal rounded-full`

Propuesta: gradient sutil:
```
w-12 h-1 rounded-full bg-gradient-to-r from-brand-teal to-brand-blue
```

### 1.4 Dashboard — Saludo contextual ✅

**Archivos**: `app/app/dashboard/page.tsx`, `app/admin/dashboard/page.tsx`

Reemplazar el "Bienvenido" genérico por saludo con hora del día:

```typescript
function getGreeting(): string {
  const hour = new Date().getHours()
  if (hour < 12) return 'Buenos días'
  if (hour < 20) return 'Buenas tardes'
  return 'Buenas noches'
}
```

Mostrar: `"Buenos días, Mario"` (usando `full_name` del perfil, o primer nombre).

### 1.5 Dashboard — Service cards con mejor hover ✅

**Archivos**: `app/app/dashboard/page.tsx`, `app/admin/dashboard/page.tsx`

Actual hover: `hover:shadow-md`

Propuesta:
```
hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
```

Añadir también una línea teal sutil en el borde izquierdo de las service cards:
```
border-l-2 border-l-brand-teal/0 hover:border-l-brand-teal
```

### 1.6 Dashboard — Stagger animation en carga ✅

Aplicar `animate-fade-in-up` con delays escalonados a los elementos del dashboard:
- Icono de bienvenida: delay 0ms
- Saludo + nombre: delay 80ms
- Texto descriptivo: delay 160ms
- Service cards: delay 240ms

### 1.7 Tooltips en floating buttons ⬜

**Archivos**: `components/logout-button.tsx`, `components/notifications-bell.tsx`, `components/company-info-button.tsx`, `components/department-info-button.tsx`

Añadir tooltip nativo con `title` como solución simple, o crear un componente Tooltip con CSS:

```tsx
// Tooltip CSS-only: usar group + opacity transition
<div className="group relative">
  <button>...</button>
  <span className="
    absolute right-full mr-2 top-1/2 -translate-y-1/2
    px-2 py-1 rounded bg-gray-900 text-white text-xs whitespace-nowrap
    opacity-0 group-hover:opacity-100 transition-opacity duration-150 delay-150
    pointer-events-none
  ">
    Cerrar sesión
  </span>
</div>
```

---

---

## Bugs corregidos durante implementación

### B1 — Cards solapadas en dashboard (admin + client) ✅
- **Causa**: el contenedor `.stagger-children` no tenía separación entre hijos
- **Fix**: añadido `flex flex-col gap-4` en `app/admin/dashboard/page.tsx` y `app/app/dashboard/page.tsx`

### B2 — Botón Google GIS sin hover consistente 🔧
- **Causa**: el SDK GIS renderiza su botón con estilos propios; un wrapper de elevación chocaba visualmente
- **Fix**: eliminado el wrapper hover; se mantiene el hover nativo de Google. Microsoft simplificado a `hover:bg-gray-50` para consistencia

---

## Fase 2 — Paneles laterales + Notificaciones ⬜

**Objetivo**: Pulir la experiencia de los paneles que se usan a diario.

### 2.1 Skeleton loaders ⬜

**Crear componente**: `components/ui/skeleton.tsx`

```tsx
export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn(
      "animate-pulse rounded-md bg-gray-200/60",
      className
    )} />
  )
}
```

Usarlo en:
- `company-info-button.tsx`: mientras carga datos de empresa
- `department-info-button.tsx`: mientras carga datos de departamento
- `notifications-bell.tsx`: mientras carga notificaciones
- **Replicar la forma del contenido final** (no un spinner genérico)

### 2.2 Mejorar transiciones de paneles laterales ⬜

**Archivos**: `components/company-info-button.tsx`, `components/department-info-button.tsx`

Actual: `animate-in slide-in-from-right duration-200`

Propuesta — spring-like con CSS:
```css
@keyframes slide-in-right {
  from {
    transform: translateX(100%);
    opacity: 0.8;
  }
  60% {
    transform: translateX(-2%);
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.animate-slide-in-right {
  animation: slide-in-right 0.35s cubic-bezier(0.16, 1, 0.3, 1) both;
}
```

Backdrop: aumentar blur a `backdrop-blur-md` y opacidad a `bg-black/30`.

### 2.3 Transición lectura/edición en Company Info ⬜

**Archivo**: `components/company-info-button.tsx`

Cuando el usuario pulsa "Editar", los campos pasan de texto a input. Añadir transición:
- Wrap cada campo en un contenedor con `transition-all duration-200`
- Al cambiar a edit: sutil border-teal aparece, background se aclara
- Al guardar: icono checkmark verde animado (scale 0→1 en 200ms), luego vuelve a modo lectura

### 2.4 Notificaciones — Mejor agrupación y empty state ⬜

**Archivo**: `components/notifications-bell.tsx`

- Agrupar notificaciones por fecha: "Hoy", "Ayer", "Esta semana"
- Separador visual entre grupos: `text-xs text-text-muted font-semibold uppercase tracking-wider`
- Empty state: icono de campana grande (outline, gris claro) + texto "No tienes notificaciones"
- Badge: añadir `animate-pulse` sutil cuando hay nuevas notificaciones no leídas
- Al marcar como leída: transición de `bg-blue-50` → `bg-white` con `transition-colors duration-300`

### 2.5 Feedback visual al guardar ⬜

**Archivos**: `components/company-info-button.tsx`, `components/department-info-button.tsx`

Al guardar cambios exitosamente:
- Botón cambia de "Guardar" a icono checkmark con `text-green-600` durante 1.5s
- Transición: `scale-0 → scale-100` con `transition-transform duration-200`
- Luego vuelve al estado original

---

## Fase 3 — Sidebar de navegación (opcional — cambio estructural) ⬜

**Objetivo**: Dar coherencia de navegación a toda la app.

> NOTA: Este es el cambio más grande. Requiere crear layouts compartidos.
> Si se decide NO hacer sidebar, saltar a Fase 4.

### 3.1 Layout compartido con sidebar

**Crear archivos**:
- `app/admin/(dashboard)/layout.tsx` — layout con sidebar para admin
- `app/app/(dashboard)/layout.tsx` — layout con sidebar para client
- `components/sidebar.tsx` — componente sidebar reutilizable

**Estructura del sidebar**:
```
┌─────────────────────┐
│  Logo LeanFinance    │
│                      │
│  ─────────────────   │
│                      │
│  📊 Dashboard        │  ← nav items con icono + texto
│  📋 Modelos          │
│  🔔 Notificaciones   │
│  🏢 Mi empresa       │  ← (client) o "Departamento" (admin)
│                      │
│                      │
│                      │
│  ─────────────────   │
│                      │
│  👤 Mario Pantoja    │  ← avatar + nombre + menú logout
│  └ Cerrar sesión     │
└─────────────────────┘
```

**Especificaciones**:
- Ancho expandido: `w-64`
- Ancho colapsado: `w-16` (solo iconos + tooltips)
- Toggle con botón en el header del sidebar
- Transición: `transition-all duration-300 ease-in-out`
- Item activo: `border-l-2 border-brand-teal bg-brand-teal/5 text-brand-navy font-semibold`
- Items inactivos: `text-text-muted hover:bg-gray-50 hover:text-text-body`

**Admin sidebar**:
- Fondo: `bg-brand-navy` con texto blanco
- Item activo: `border-l-2 border-brand-teal bg-white/10 text-white`
- Items inactivos: `text-white/60 hover:text-white hover:bg-white/5`

### 3.2 Migrar floating buttons a sidebar

- Mover logout, notificaciones, company/department info como items del sidebar
- Eliminar los botones flotantes (ya no necesarios)
- Notificaciones: badge numérico junto al icono en el sidebar

### 3.3 Responsive

- Desktop (≥1024px): sidebar visible, expandible/colapsable
- Tablet (768-1023px): sidebar colapsada por defecto (solo iconos)
- Móvil (<768px): sidebar oculta, hamburger button en top-left para abrirla como overlay

---

## Fase 4 — Modelos workspace ⬜

**Objetivo**: Mejorar la experiencia del flujo de trabajo principal.

### 4.1 Quarter selector como pill group

**Archivo**: `_components/quarter-selector.tsx`

Reemplazar select por botones tipo pill:

```tsx
<div className="inline-flex rounded-lg bg-gray-100 p-1">
  {[1, 2, 3, 4].map(q => (
    <button
      key={q}
      className={cn(
        "px-4 py-2 rounded-md text-sm font-medium transition-all duration-200",
        selected === q
          ? "bg-white text-brand-navy shadow-sm"
          : "text-text-muted hover:text-text-body"
      )}
    >
      T{q}
    </button>
  ))}
</div>
```

### 4.2 Stagger animation en lista de modelos

**Archivos**: `_components/models-client-list.tsx`, `_components/models-form.tsx`

Al cargar/cambiar trimestre, los items aparecen con stagger:
```css
.stagger-item {
  animation: fade-in-up 0.3s ease-out both;
}
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 50ms; }
.stagger-item:nth-child(3) { animation-delay: 100ms; }
/* ... etc */
```

### 4.3 Empty state para modelos

Cuando no hay modelos para un trimestre:

```tsx
<div className="flex flex-col items-center justify-center py-16 text-center">
  {/* Icono de documento vacío — SVG inline o Lucide */}
  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
    <FileTextIcon className="w-8 h-8 text-gray-300" />
  </div>
  <p className="text-sm font-medium text-text-body mb-1">
    No hay modelos para este trimestre
  </p>
  <p className="text-xs text-text-muted">
    Los modelos aparecerán aquí cuando estén disponibles
  </p>
</div>
```

### 4.4 Formulario admin — Mejor agrupación visual

**Archivo**: `_components/models-form.tsx`

- Agrupar campos relacionados con secciones visuales
- Header de sección: `text-xs font-semibold text-text-muted uppercase tracking-wider mb-3`
- Separador entre secciones: `border-t border-gray-100 my-6`
- Campos numéricos con `font-mono` para alineación visual

### 4.5 Client search mejorado (admin)

**Archivo**: `_components/client-search.tsx`

- Input con icono de búsqueda a la izquierda
- Dropdown con resultados filtrados en tiempo real
- Cada item muestra nombre comercial + NIF en gris
- Highlight del texto que coincide con la búsqueda
- Keyboard navigation (↑↓ para moverse, Enter para seleccionar)

---

## Fase 5 — Micro-interacciones globales ✅ COMPLETADA

**Objetivo**: Pulir detalles que se sienten en toda la app.

### 5.1 Focus rings consistentes ✅

**Archivo**: `app/globals.css`

```css
/* Unificar focus visible en toda la app */
:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px hsl(var(--brand-teal) / 0.3);
  border-radius: inherit;
}
```

### 5.2 Active state en botones ✅

Añadir a todos los botones interactivos:
```
active:scale-[0.97] transition-transform duration-100
```

### 5.3 Números en monospace ⬜

**Aplicar `font-mono`** en:
- NIFs en company-info y department-info
- IBANs en cuentas bancarias
- Teléfonos
- Importes en modelos

### 5.4 Tipografía refinada ✅

- Headings grandes (`text-2xl`+): añadir `tracking-tight`
- Labels de sección: unificar a `text-xs font-semibold text-text-muted uppercase tracking-wider`
- Textos descriptivos: `leading-relaxed` para mejor legibilidad

### 5.5 Respetar prefers-reduced-motion ✅

**Archivo**: `app/globals.css`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## Notas de implementación

### No instalar Framer Motion (por ahora)
Todas las animaciones propuestas se pueden lograr con CSS puro (keyframes + transitions).
Solo considerar Framer Motion si en el futuro se necesitan animaciones complejas (drag, layout animations, AnimatePresence).

### No instalar shadcn/ui (por ahora)
Los componentes actuales son custom y funcionan bien. Si en el futuro crece la complejidad (tablas de datos, formularios complejos, command palette), entonces evaluar shadcn/ui.

### Orden de implementación sugerido
1. **Fase 5** primero (globals) — porque establece las bases visuales para todo lo demás
2. **Fase 1** — login + dashboard (impacto inmediato en primera impresión)
3. **Fase 2** — paneles laterales + notificaciones
4. **Fase 4** — modelos workspace
5. **Fase 3** — sidebar (si se decide implementar, es la más invasiva)

### Testing visual
Tras cada cambio, verificar en:
- Chrome desktop (1440px)
- Chrome responsive (375px — iPhone SE)
- Safari (por diferencias en backdrop-blur y animaciones)
- Dark mode del SO no aplica (la app no tiene dark mode)
