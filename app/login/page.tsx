import { redirect } from "next/navigation";

// Ruta legacy → redirige al espacio de clientes
export default function LegacyLoginPage() {
  redirect("/app/login");
}
