import { getMyContactTeam } from "@/app/app/contacto/actions";
import ContactTeamView from "@/components/contact/contact-team-view";

export default async function ContactoPage() {
  const data = await getMyContactTeam();

  return (
    <div className="px-4 sm:px-8 pt-12 pb-12">
      <div className="max-w-4xl mx-auto">
        <p className="text-brand-teal text-sm font-medium mb-2">Portal de clientes</p>
        <h1 className="text-3xl font-bold font-heading text-brand-navy tracking-tight">
          Contacto
        </h1>
        <p className="mt-3 text-sm text-text-muted max-w-2xl">
          Aquí encontrarás al equipo de Lean Finance que se encarga de
          ayudarte. Para cualquier consulta escribe directamente al personal
          asociado. Si surge un problema técnico con la plataforma, puedes
          contactar al soporte.
        </p>
        <div className="w-10 h-0.5 bg-brand-teal rounded-full mt-6 mb-10" />

        <ContactTeamView data={data} />
      </div>
    </div>
  );
}
