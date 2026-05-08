"use client";

interface Props {
  accounts: string[];
  selectedAccount: string | null;
  onChange: (account: string | null) => void;
}

export default function DashboardBankSelector({ accounts, selectedAccount, onChange }: Props) {
  if (!accounts || accounts.length <= 1) return null;

  return (
    <select
      value={selectedAccount ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
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
