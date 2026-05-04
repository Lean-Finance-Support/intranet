// Catálogo de plantillas de email transaccional asociables a apartados del
// catálogo de documentación. Cada apartado puede tener un slug aquí (columna
// `email_template_slug` en `documentation.apartados`); cuando se asigna ese
// apartado a una empresa desde el flujo "Asignación múltiple", la UI ofrece
// disparar el email correspondiente.
//
// Las plantillas en sí (HTML/copy) viven en código de la edge function
// `notify-documentation-template-email` (supabase/functions/_shared/
// email-templates/<slug>.ts). Este archivo solo expone el listado para la UI
// del catálogo (selector) y para validar el slug antes de persistirlo. Añadir
// una plantilla = nuevo entry aquí + nuevo módulo en la edge function.

export interface DocumentationEmailTemplateMeta {
  slug: string;
  name: string;
  description: string;
}

export const DOCUMENTATION_EMAIL_TEMPLATES: readonly DocumentationEmailTemplateMeta[] = [
  {
    slug: "dashboard-holded-contrato",
    name: "Dashboard Holded + Contrato de tratamiento de datos",
    description:
      "Anuncia la nueva integración de Dashboard de Holded y solicita la firma del contrato de tratamiento de datos para activar el volcado.",
  },
] as const;

export function findDocumentationEmailTemplate(
  slug: string | null | undefined
): DocumentationEmailTemplateMeta | null {
  if (!slug) return null;
  return DOCUMENTATION_EMAIL_TEMPLATES.find((t) => t.slug === slug) ?? null;
}

export function isValidDocumentationEmailTemplateSlug(slug: string): boolean {
  return DOCUMENTATION_EMAIL_TEMPLATES.some((t) => t.slug === slug);
}
