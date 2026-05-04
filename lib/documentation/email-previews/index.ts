// Barrel + dispatcher de previews de emails de documentación. Las server
// actions resuelven los datos reales (empresa, destinatario, apartado…) y
// llaman a estos builders para devolver `{ subject, html }` al popover.

export {
  buildClientReminderPreviewHtml,
  buildClientReminderPreviewSubject,
} from "./client-reminder";
export type {
  ClientReminderApartadoRow,
  ClientReminderApartadoStatus,
  ClientReminderPreviewContext,
} from "./client-reminder";

export {
  buildDashboardHoldedContratoPreviewHtml,
  buildDashboardHoldedContratoPreviewSubject,
} from "./dashboard-holded-contrato";
export type { DashboardHoldedContratoPreviewContext } from "./dashboard-holded-contrato";

import {
  buildDashboardHoldedContratoPreviewHtml,
  buildDashboardHoldedContratoPreviewSubject,
  type DashboardHoldedContratoPreviewContext,
} from "./dashboard-holded-contrato";

export interface EmailPreviewResult {
  subject: string;
  html: string;
}

export interface ApartadoTemplatePreviewArgs {
  slug: string;
  ctx: DashboardHoldedContratoPreviewContext;
}

/**
 * Despacha el builder por slug. Mantener en sync con el catálogo en
 * `lib/documentation/email-templates.ts` y con los entries de `TEMPLATES`
 * en `supabase/functions/notify-documentation-template-email/index.ts`.
 */
export function previewApartadoTemplateEmail(
  args: ApartadoTemplatePreviewArgs
): EmailPreviewResult | null {
  switch (args.slug) {
    case "dashboard-holded-contrato":
      return {
        subject: buildDashboardHoldedContratoPreviewSubject(args.ctx),
        html: buildDashboardHoldedContratoPreviewHtml(args.ctx),
      };
    default:
      return null;
  }
}
