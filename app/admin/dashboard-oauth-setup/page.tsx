import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/require-admin";
import { getOAuth2Client, SHEETS_SCOPE } from "@/lib/google-sheets/client";

interface PageProps {
  searchParams: Promise<{ error?: string }>;
}

const STATE_COOKIE = "dashboard_oauth_state";
const TOKEN_COOKIE = "dashboard_oauth_token";

function buildRedirectUri(host: string, protocol: string): string {
  return `${protocol}://${host}/api/dashboard-oauth-callback`;
}

// Server action: genera state random, lo guarda en cookie httpOnly y redirige
// a Google con state en el query. La cookie y el state recibido se validan en
// /api/dashboard-oauth-callback para evitar CSRF (refresh_token poisoning).
async function startOAuthFlow(): Promise<void> {
  "use server";
  await requireAdmin();
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = buildRedirectUri(host, protocol);

  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 10, // 10 min para completar el flujo OAuth
  });

  const oauth = getOAuth2Client();
  const consentUrl = oauth.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [SHEETS_SCOPE],
    redirect_uri: redirectUri,
    state,
  });
  redirect(consentUrl);
}

export default async function DashboardOAuthSetupPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = buildRedirectUri(host, protocol);

  // Si el callback acaba de completar el intercambio, deja el token en una
  // cookie httpOnly single-use (TTL 60 s). Lo leemos aquí, lo mostramos y la
  // cookie expira sola. No pasamos el token por query string, así no aparece
  // en logs/Referer/history.
  const cookieStore = await cookies();
  const tokenCookie = cookieStore.get(TOKEN_COOKIE);
  const refreshToken = tokenCookie?.value ?? null;

  let envError: string | null = null;
  try {
    getOAuth2Client();
  } catch (err) {
    envError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
    <>
      {/* Defensa en profundidad: si por algún motivo el token llegara a estar
          visible en el HTML, evita que el navegador lo filtre vía Referer al
          navegar fuera. Cache-Control evita que se guarde en caches
          compartidos. */}
      <meta name="referrer" content="no-referrer" />
      <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, private" />
      <meta httpEquiv="Pragma" content="no-cache" />
      <div className="min-h-screen bg-surface-gray px-8 py-12">
        <div className="max-w-2xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8 space-y-6">
          <header>
            <p className="text-brand-teal text-xs font-medium uppercase tracking-wider">Setup</p>
            <h1 className="text-2xl font-bold font-heading text-brand-navy tracking-tight">
              Conectar Google Sheets para los dashboards
            </h1>
            <p className="text-sm text-text-muted mt-2">
              Autoriza con la cuenta de Google que ya tiene acceso de lectura a los Sheets de los
              clientes (p. ej. <code className="text-xs bg-gray-100 px-1 rounded">tech@leanfinance.es</code>).
              Solo se necesita hacer una vez por entorno.
            </p>
          </header>

          {envError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {envError}
            </div>
          )}

          {params.error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              Error en la autorización: {params.error}
            </div>
          )}

          {refreshToken && (
            <div className="space-y-3">
              <p className="text-sm text-text-body">
                ¡Listo! Copia este <strong>refresh token</strong> y pégalo en{" "}
                <code className="text-xs bg-gray-100 px-1 rounded">.env.local</code> (y en Vercel)
                como <code className="text-xs bg-gray-100 px-1 rounded">GOOGLE_OAUTH_REFRESH_TOKEN</code>.
                Luego reinicia el servidor.
              </p>
              <pre className="bg-brand-navy text-white text-xs p-4 rounded-lg overflow-x-auto break-all whitespace-pre-wrap">
                {refreshToken}
              </pre>
              <p className="text-[11px] text-text-muted">
                Este token solo se muestra una vez (TTL 60 s). Si lo pierdes, vuelve a esta página y reautoriza.
              </p>
            </div>
          )}

          {!envError && !refreshToken && (
            <div className="space-y-3">
              <ol className="text-sm text-text-body space-y-2 list-decimal pl-5">
                <li>
                  Asegúrate de que en el OAuth Client de Google Cloud está añadido este redirect URI:
                  <code className="block text-xs bg-gray-100 px-2 py-1 mt-1 rounded break-all">
                    {redirectUri}
                  </code>
                </li>
                <li>Haz clic en &ldquo;Autorizar&rdquo; e inicia sesión con la cuenta correcta.</li>
                <li>Acepta el permiso de lectura de Google Sheets.</li>
                <li>Volverás aquí con el refresh token listo para copiar.</li>
              </ol>
              <form action={startOAuthFlow}>
                <button
                  type="submit"
                  className="inline-block bg-brand-teal text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-teal/90"
                >
                  Autorizar con Google →
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
