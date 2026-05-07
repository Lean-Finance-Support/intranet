import { headers } from "next/headers";
import { requireAdmin } from "@/lib/require-admin";
import { getOAuth2Client, SHEETS_SCOPE } from "@/lib/google-sheets/client";

interface PageProps {
  searchParams: Promise<{ refresh_token?: string; error?: string }>;
}

function buildRedirectUri(host: string, protocol: string): string {
  return `${protocol}://${host}/api/dashboard-oauth-callback`;
}

export default async function DashboardOAuthSetupPage({ searchParams }: PageProps) {
  await requireAdmin();
  const params = await searchParams;
  const hdrs = await headers();
  const host = hdrs.get("host") ?? "localhost:3000";
  const protocol = host.startsWith("localhost") ? "http" : "https";
  const redirectUri = buildRedirectUri(host, protocol);

  let consentUrl: string | null = null;
  let envError: string | null = null;
  try {
    const oauth = getOAuth2Client();
    consentUrl = oauth.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      scope: [SHEETS_SCOPE],
      redirect_uri: redirectUri,
    });
  } catch (err) {
    envError = err instanceof Error ? err.message : "Error desconocido";
  }

  return (
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

        {params.refresh_token && (
          <div className="space-y-3">
            <p className="text-sm text-text-body">
              ¡Listo! Copia este <strong>refresh token</strong> y pégalo en{" "}
              <code className="text-xs bg-gray-100 px-1 rounded">.env.local</code> (y en Vercel)
              como <code className="text-xs bg-gray-100 px-1 rounded">GOOGLE_OAUTH_REFRESH_TOKEN</code>.
              Luego reinicia el servidor.
            </p>
            <pre className="bg-brand-navy text-white text-xs p-4 rounded-lg overflow-x-auto break-all whitespace-pre-wrap">
              {params.refresh_token}
            </pre>
            <p className="text-[11px] text-text-muted">
              No vamos a volver a mostrar este token. Si lo pierdes, vuelve a esta página y reautoriza.
            </p>
          </div>
        )}

        {consentUrl && !params.refresh_token && (
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
            <a
              href={consentUrl}
              className="inline-block bg-brand-teal text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-brand-teal/90"
            >
              Autorizar con Google →
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
