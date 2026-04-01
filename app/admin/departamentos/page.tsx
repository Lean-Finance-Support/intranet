import { redirect } from "next/navigation";

// Esta página ha sido reemplazada por /admin/select-department
export default function DeprecatedDepartmentsPage() {
  redirect("/admin/select-department");
}
