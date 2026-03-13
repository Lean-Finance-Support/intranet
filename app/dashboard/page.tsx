import { redirect } from "next/navigation";

// Ruta legacy → redirige al dashboard de clientes
export default function LegacyDashboardPage() {
  redirect("/app/dashboard");
}
