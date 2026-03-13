# Plan: Login Page — app.leanfinance.es

- **Goal:** Página de login con email + CIF/NIF usando Supabase Auth, con diseño LeanFinance
- **Architecture:** Next.js 16 App Router · Supabase Auth · Server Actions · Middleware
- **Tech stack:** Next.js, TypeScript, Tailwind v4, @supabase/ssr, @supabase/supabase-js
- **Date:** 2026-03-11

---

## File Map

```
app/globals.css                  → Design tokens LeanFinance (colores, fuentes)
app/layout.tsx                   → Lato desde Google Fonts, metadata actualizada
app/page.tsx                     → Redirect a /login (raíz pública)
app/login/page.tsx               → Página de login (UI)
app/login/actions.ts             → Server Action: signIn con Supabase
app/dashboard/page.tsx           → Placeholder post-login (ruta protegida)
lib/supabase/client.ts           → Supabase browser client
lib/supabase/server.ts           → Supabase server client (SSR)
middleware.ts                    → Protección de rutas: redirect si no hay sesión
.env.local                       → NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
```

---

## Tasks

### 0. Setup de dependencias y variables de entorno

- [ ] 0.1 Instalar dependencias:
  ```bash
  npm install @supabase/supabase-js @supabase/ssr
  ```
- [ ] 0.2 Crear `.env.local` con las keys del proyecto Supabase `wgxugccbatusioubnsfl`:
  ```
  NEXT_PUBLIC_SUPABASE_URL=https://wgxugccbatusioubnsfl.supabase.co
  NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon-key>
  ```

---

### 1. Design tokens LeanFinance en Tailwind v4

- [ ] 1.1 Actualizar `app/globals.css`: añadir colores, fuentes y tipografía LeanFinance via `@theme`
- [ ] 1.2 Actualizar `app/layout.tsx`: cargar fuente Lato desde Google Fonts, eliminar Geist

---

### 2. Clientes Supabase

- [ ] 2.1 Crear `lib/supabase/client.ts` — cliente browser (`createBrowserClient`)
- [ ] 2.2 Crear `lib/supabase/server.ts` — cliente server (`createServerClient` con cookies)

---

### 3. Middleware de protección de rutas

- [ ] 3.1 Crear `middleware.ts`:
  - Rutas públicas: `/login`
  - Todo lo demás requiere sesión activa → redirect a `/login`
  - Si hay sesión y va a `/login` → redirect a `/dashboard`

---

### 4. Server Action de login

- [ ] 4.1 Crear `app/login/actions.ts`:
  - Recibe `email` + `cifNif`
  - Llama a `supabase.auth.signInWithPassword({ email, password: cifNif })`
  - Si error → devuelve mensaje de error
  - Si OK → `redirect('/dashboard')`

---

### 5. Página de login

- [ ] 5.1 Crear `app/login/page.tsx` con diseño LeanFinance:
  - Fondo `surface-gray` (#F9FAFB) con card central blanca
  - Logo LeanFinance (texto con tipografía heading)
  - Label eyebrow teal + H1 navy
  - Inputs: email + CIF/NIF
  - Botón CTA `rounded-full bg-brand-teal`
  - Mensaje de error inline si falla
  - Sin navbar ni footer

---

### 6. Dashboard placeholder

- [ ] 6.1 Crear `app/dashboard/page.tsx` — página mínima que confirma login correcto
- [ ] 6.2 Actualizar `app/page.tsx` → redirect a `/login`

---

### 7. Verificación

- [ ] 7.1 Arrancar servidor: `npm run dev`
- [ ] 7.2 Verificar que `/` redirige a `/login`
- [ ] 7.3 Verificar que `/dashboard` sin sesión redirige a `/login`
- [ ] 7.4 Hacer login con credenciales de prueba → llega a `/dashboard`
- [ ] 7.5 Screenshot del resultado
