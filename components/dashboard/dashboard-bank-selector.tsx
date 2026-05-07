"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";

interface Props {
  accounts: string[];
  selectedAccount: string | null;
}

export default function DashboardBankSelector({ accounts, selectedAccount }: Props) {
  const router = useRouter();
  const pathname = usePathname() ?? "/dashboard";
  const searchParams = useSearchParams();

  if (!accounts || accounts.length <= 1) return null;

  function handleChange(value: string) {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    if (!value) params.delete("bank");
    else params.set("bank", value);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  return (
    <select
      value={selectedAccount ?? ""}
      onChange={(e) => handleChange(e.target.value)}
      className="text-[10px] font-semibold uppercase tracking-wider rounded-md bg-white/10 text-white px-2 py-1 border-none focus:outline-none focus:ring-2 focus:ring-white/30 cursor-pointer"
    >
      <option value="" className="text-brand-navy">Todas las cuentas</option>
      {accounts.map((a) => (
        <option key={a} value={a} className="text-brand-navy">
          {a}
        </option>
      ))}
    </select>
  );
}
