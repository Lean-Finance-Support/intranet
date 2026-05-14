import { PAGE_ENTRIES } from "./registry";
import type { SearchContext, SearchDestination } from "./types";

/**
 * Construye la lista plana de destinos para el contexto actual.
 * Combina páginas estáticas + entradas dinámicas (empresas, secciones por empresa,
 * switch de empresa) respetando los gates de permisos/servicios.
 */
export function buildDestinations(ctx: SearchContext): SearchDestination[] {
  const out: SearchDestination[] = [];

  for (const entry of PAGE_ENTRIES) {
    if (entry.space !== ctx.space) continue;
    if (entry.gate && !entry.gate(ctx)) continue;
    out.push({
      id: entry.id,
      group: "pages",
      label: entry.label,
      href: `${ctx.linkPrefix}${entry.path}`,
      icon: entry.icon,
      keywords: entry.keywords,
    });
  }

  if (ctx.space === "admin") {
    for (const company of ctx.companies) {
      const displayName = company.company_name || company.legal_name;
      const alt = company.company_name ? company.legal_name : null;
      const keywords = ["empresa", "cliente"];
      if (alt) keywords.push(alt);

      out.push({
        id: `company:${company.id}`,
        group: "clients",
        label: displayName,
        sublabel: alt ?? undefined,
        href: `${ctx.linkPrefix}/clientes/${company.id}`,
        icon: "building",
        keywords,
      });

      if (company.has_dashboard_service && ctx.canViewClientDashboard) {
        out.push({
          id: `company-dashboard:${company.id}`,
          group: "client-sections",
          label: `Dashboard de ${displayName}`,
          sublabel: "Dashboard fiscal",
          href: `${ctx.linkPrefix}/clientes/${company.id}/dashboard`,
          icon: "chart",
          keywords: ["dashboard", "fiscal", displayName, alt ?? ""].filter(Boolean),
        });
      }

      if (company.has_tax_models_service && ctx.hasTaxModels) {
        out.push({
          id: `company-modelos:${company.id}`,
          group: "client-sections",
          label: `Modelos fiscales de ${displayName}`,
          sublabel: "Modelos del cliente",
          href: `${ctx.linkPrefix}/modelos?company=${company.id}`,
          icon: "document",
          keywords: ["modelos", "iva", "303", "fiscal", displayName, alt ?? ""].filter(Boolean),
        });
      }

      if (company.has_declaracion_renta_service) {
        out.push({
          id: `company-renta:${company.id}`,
          group: "client-sections",
          label: `Declaración de la renta de ${displayName}`,
          sublabel: "Formulario y envíos",
          href: `${ctx.linkPrefix}/clientes/${company.id}?tab=informes`,
          icon: "document",
          keywords: ["renta", "irpf", "declaración", "deducciones", displayName, alt ?? ""].filter(Boolean),
        });
      }
    }
  }

  if (ctx.space === "client" && ctx.companies.length > 1) {
    for (const company of ctx.companies) {
      if (company.id === ctx.activeCompanyId) continue;
      const displayName = company.company_name || company.legal_name;
      out.push({
        id: `switch-company:${company.id}`,
        group: "company-switch",
        label: `Cambiar a ${displayName}`,
        sublabel: company.company_name ? company.legal_name : undefined,
        // El href se interpreta especialmente: el provider detecta el id en metadata
        // a través del id del destino para invocar setActiveCompany.
        href: `${ctx.linkPrefix}/set-company?companyId=${company.id}&next=${ctx.linkPrefix}/dashboard`,
        icon: "swap",
        keywords: ["cambiar", "empresa", "switch"],
      });
    }
  }

  return out;
}
