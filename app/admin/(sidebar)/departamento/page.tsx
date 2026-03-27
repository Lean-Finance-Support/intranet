import DepartamentoPage from "@/components/departamento-page";
import { getAllDepartmentsInfo } from "@/app/admin/departamento/actions";

export default async function AdminDepartamentoPage() {
  const departments = await getAllDepartmentsInfo();
  return <DepartamentoPage departments={departments} />;
}
