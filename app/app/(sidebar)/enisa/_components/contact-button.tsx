"use client";

interface ContactButtonProps {
  emails: string[];
  companyName: string;
}

export default function ContactButton({ emails, companyName }: ContactButtonProps) {
  if (emails.length === 0) return null;

  const subject = encodeURIComponent(
    `Consulta documentación ENISA${companyName ? ` — ${companyName}` : ""}`
  );
  const href = `mailto:${emails.join(",")}?subject=${subject}`;

  return (
    <a
      href={href}
      className="inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold text-brand-teal border-2 border-brand-teal/20 hover:border-brand-teal/40 hover:bg-brand-teal/5 transition-all"
    >
      <MailIcon />
      Contacta con tu técnico
    </a>
  );
}

function MailIcon() {
  return (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
    </svg>
  );
}
