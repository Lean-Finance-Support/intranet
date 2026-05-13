"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  ClienteCompany,
  ClienteService,
  ClientAccount,
  CompanyDashboardConfig,
  CompanyDetailInfo,
  DeptMemberSlim,
} from "@/app/admin/clientes/actions";
import {
  addServiceToCompany,
  removeServiceFromCompany,
  assignTechnicianAdmin,
  removeTechnicianAdmin,
  assignAllTechniciansAdmin,
  deleteCompanyAdmin,
  restoreCompanyAdmin,
  updateCompanyNameAdmin,
  addCompanyBankAccountAdmin,
  updateCompanyBankAccountAdmin,
  deleteCompanyBankAccountAdmin,
  createClientAccount,
  updateClientAccount,
  unlinkClientFromCompany,
  listTeamMemberCandidates,
  addTeamMemberToCompany,
  removeTeamMemberFromCompany,
  type TeamMemberCandidate,
} from "@/app/admin/clientes/actions";
import { SERVICE_SLUGS } from "@/lib/types/services";
import type {
  BlockTemplate,
  ClientDocumentation,
  DepartmentMember,
  ClientApartado,
} from "@/lib/types/documentation";
import {
  addAdminComment,
  addApartadoToClient,
  addBlockToClient,
  addSupervisor,
  adminSoftDeleteApartadoFile,
  adminSubmitFormApartado,
  adminUploadApartadoFile,
  getApartadoFileSignedUrl,
  getApartadoTemplateSignedUrl,
  getClientReminderPreviewHtml,
  getDecryptedEnisaPassword,
  rejectApartado,
  remindClientDocumentation,
  removeApartadoFromClient,
  removeBlockFromClient,
  removeSupervisor,
  reopenApartado,
  setApartadoOptional,
  validateApartado,
} from "@/app/admin/clientes/[id]/documentation-actions";
import type { CompanyBankAccount } from "@/lib/types/bank-accounts";
import type { ResponsibleTeam } from "@/lib/team-queries";
import {
  BankAccountForm,
  EditClientAccountForm,
  AddClientAccountForm,
} from "@/components/client-detail-panel";
import DocumentationMasterDetail from "@/components/documentation/documentation-master-detail";
import ConfirmDialog from "@/components/confirm-dialog";
import dynamic from "next/dynamic";

// Modales que solo aparecen al pulsar acciones puntuales: cargamos su JS solo
// cuando se necesitan, recortando el bundle inicial del workspace.
const DeleteCompanyModal = dynamic(
  () => import("@/components/delete-company-modal"),
  { ssr: false },
);
const AddBlockModal = dynamic(() => import("./add-block-modal"), { ssr: false });
const AddApartadoModal = dynamic(() => import("./add-apartado-modal"), { ssr: false });

// Secciones de tabs distintas a la default ("documentacion"). El usuario solo
// las ve al hacer clic en la pestaña correspondiente; postergamos su JS para
// recortar el bundle inicial del workspace (1.3k líneas de host + estas
// secciones suman ~900 líneas extra).
const ResponsibleTeamSection = dynamic(
  () => import("@/components/clients/responsible-team-section"),
);
const ServiceDetailSection = dynamic(
  () => import("@/components/clients/service-detail-section"),
);
const DashboardSheetPanel = dynamic(
  () => import("@/components/clients/dashboard-sheet-panel"),
);

interface Props {
  detail: CompanyDetailInfo;
  company: ClienteCompany;
  userChiefDeptIds: string[];
  deptMembers: { [deptId: string]: DeptMemberSlim[] };
  departments: { id: string; name: string }[];
  allAdminCandidates: DeptMemberSlim[];
  chiefAvailableServices: {
    service_id: string;
    service_name: string;
    service_slug: string;
    department_id: string;
  }[];
  canCreateCompany: boolean;
  canDeleteCompany: boolean;
  canManageClientAccounts: boolean;
  canManageBankAccounts: boolean;
  linkPrefix: string;
  documentation: ClientDocumentation;
  assignableCatalog: {
    blocks: BlockTemplate[];
    allBlocks: BlockTemplate[];
    membersByDept: Record<string, DepartmentMember[]>;
    canRequest: boolean;
  };
  canValidateGlobal: boolean;
  supervisorClientApartadoIds: string[];
  responsibleTeam: ResponsibleTeam;
  currentUserId: string;
  initialTab: string;
  dashboardConfig: CompanyDashboardConfig | null;
  dashboardAuthorizedEmail: string | null;
  canViewClientDashboard: boolean;
  canViewClientTaxModels: boolean;
}

type TabKey =
  | "documentacion"
  | "equipo"
  | "servicios"
  | "aplicaciones"
  | "informes"
  | "datos";

const TABS: { key: TabKey; label: string }[] = [
  { key: "documentacion", label: "Documentación" },
  { key: "equipo", label: "Equipo responsable" },
  { key: "servicios", label: "Servicios contratados" },
  { key: "aplicaciones", label: "Aplicaciones" },
  { key: "informes", label: "Informes / Formularios" },
  { key: "datos", label: "Datos" },
];

// Backward-compat: las pestañas "cuentas" y "bancos" se fusionaron en "datos".
function resolveInitialTab(raw: string): TabKey {
  if (raw === "cuentas" || raw === "bancos") return "datos";
  return (TABS.find((t) => t.key === raw)?.key as TabKey) ?? "documentacion";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "long", year: "numeric" });
}

/**
 * Construye los grupos de candidatos a técnico que renderiza el selector
 * agrupado por departamento de `ServiceDetailSection`.
 *
 * - Servicio con dpto: 1 grupo (los miembros del dpto del servicio).
 * - Servicio transversal: N grupos (todos los dpts con miembros + grupo "Sin
 *   departamento" para admins que no pertenecen a ningún dpto).
 */
function buildMemberGroups(args: {
  isTransversal: boolean;
  svcDeptId: string;
  deptMembers: { [deptId: string]: DeptMemberSlim[] };
  departments: { id: string; name: string }[];
  allAdminCandidates: DeptMemberSlim[];
}): { dept_id: string; dept_name: string; members: DeptMemberSlim[] }[] {
  if (!args.isTransversal) {
    const dept = args.departments.find((d) => d.id === args.svcDeptId);
    return [
      {
        dept_id: args.svcDeptId,
        dept_name: dept?.name ?? "Departamento",
        members: args.deptMembers[args.svcDeptId] ?? [],
      },
    ];
  }
  const groups = args.departments
    .map((d) => ({
      dept_id: d.id,
      dept_name: d.name,
      members: args.deptMembers[d.id] ?? [],
    }))
    .filter((g) => g.members.length > 0);
  // Admins que no pertenecen a ningún dpto → grupo "Sin departamento".
  const deptMembersFlat = new Set(
    Object.values(args.deptMembers).flat().map((m) => m.id)
  );
  const noDeptAdmins = args.allAdminCandidates.filter(
    (m) => !deptMembersFlat.has(m.id)
  );
  if (noDeptAdmins.length > 0) {
    groups.push({
      dept_id: "__no_dept__",
      dept_name: "Sin departamento",
      members: noDeptAdmins,
    });
  }
  return groups;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(new Error("No se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

export default function ClientDetailWorkspace({
  detail,
  company: initialCompany,
  userChiefDeptIds,
  deptMembers,
  departments,
  allAdminCandidates,
  chiefAvailableServices,
  canCreateCompany,
  canDeleteCompany,
  canManageClientAccounts,
  canManageBankAccounts,
  linkPrefix,
  documentation,
  assignableCatalog,
  canValidateGlobal,
  supervisorClientApartadoIds,
  responsibleTeam,
  currentUserId,
  initialTab,
  dashboardConfig,
  dashboardAuthorizedEmail,
  canViewClientDashboard,
  canViewClientTaxModels,
}: Props) {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>(resolveInitialTab(initialTab));
  const [company, setCompany] = useState(initialCompany);
  // Sincroniza el estado local con los nuevos datos del server tras
  // router.refresh(). Esto refleja, p.ej., los técnicos auto-asignados a un
  // servicio recién contratado sin necesidad de recargar manualmente.
  useEffect(() => setCompany(initialCompany), [initialCompany]);
  const [addingBlock, setAddingBlock] = useState(false);
  const [addingApartado, setAddingApartado] = useState<{
    clientBlockId: string;
    blockId: string;
  } | null>(null);

  // Service & technician state
  const [addingService, setAddingService] = useState(false);
  const [savingService, setSavingService] = useState(false);
  const [serviceError, setServiceError] = useState<string | null>(null);

  // Equipo responsable — candidatos para añadir (cargados on-demand cuando se
  // abre el tab equipo). Además recibimos los dpts donde el actor puede
  // gestionar (write_dept_service), que la UI usa para mostrar/ocultar la X
  // en cada miembro según su dpto.
  const [teamData, setTeamData] = useState<{
    candidates: TeamMemberCandidate[];
    manageableDeptIds: string[];
  } | null>(null);
  const [teamCandidatesLoading, setTeamCandidatesLoading] = useState(false);
  useEffect(() => {
    if (tab !== "equipo") return;
    if (teamData !== null) return;
    let cancelled = false;
    setTeamCandidatesLoading(true);
    listTeamMemberCandidates(company.id)
      .then((rows) => {
        if (!cancelled) setTeamData(rows);
      })
      .catch(() => {
        if (!cancelled) setTeamData({ candidates: [], manageableDeptIds: [] });
      })
      .finally(() => {
        if (!cancelled) setTeamCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tab, teamData, company.id]);
  async function refreshTeamCandidates() {
    try {
      const rows = await listTeamMemberCandidates(company.id);
      setTeamData(rows);
    } catch {
      setTeamData({ candidates: [], manageableDeptIds: [] });
    }
  }
  async function handleAddTeamMember(profileId: string) {
    await addTeamMemberToCompany(company.id, profileId);
    router.refresh();
    await refreshTeamCandidates();
  }
  async function handleRemoveTeamMember(profileId: string) {
    await removeTeamMemberFromCompany(company.id, profileId);
    router.refresh();
    await refreshTeamCandidates();
  }

  // Danger zone state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);

  // Datos — editable company name
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(company.company_name ?? "");
  const [savingName, setSavingName] = useState(false);

  // Bank accounts state
  const [bankAccounts, setBankAccounts] = useState<CompanyBankAccount[]>(detail.bank_accounts);
  const [addingBank, setAddingBank] = useState(false);
  const [editingBankId, setEditingBankId] = useState<string | null>(null);
  const [deletingBankId, setDeletingBankId] = useState<string | null>(null);

  // Client accounts state
  const [profiles, setProfiles] = useState<ClientAccount[]>(detail.profiles);
  const [addingAccount, setAddingAccount] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [unlinkConfirmAccount, setUnlinkConfirmAccount] = useState<ClientAccount | null>(null);
  const [pendingRemoveService, setPendingRemoveService] = useState<ClienteService | null>(null);

  const isDeleted = detail.deleted_at != null;
  const canEditCompany = !isDeleted;
  const isChiefOfAny = userChiefDeptIds.length > 0;
  const existingServiceIds = new Set(company.services.map((s) => s.service_id));
  const availableToAdd = chiefAvailableServices.filter(
    (s) => !existingServiceIds.has(s.service_id)
  );

  // Features desbloqueadas por servicios padre. Modelos fiscales = Asesoramiento
  // fiscal y contable; Dashboard fiscal = Gestión administrativa externalizada.
  const hasTaxAccountingAdvice = company.services.some(
    (s) => s.service_slug === SERVICE_SLUGS.TAX_ACCOUNTING_ADVICE
  );
  const hasExternalizedAdmin = company.services.some(
    (s) => s.service_slug === SERVICE_SLUGS.EXTERNALIZED_ADMIN
  );
  // Para editar la config del Sheet del Dashboard hace falta ser chief del dpto
  // Asesoría Fiscal y Contable (servicio padre vive ahí).
  const externalizedAdminDeptId = company.services.find(
    (s) => s.service_slug === SERVICE_SLUGS.EXTERNALIZED_ADMIN
  )?.department_id;
  const canEditDashboardSheet =
    canEditCompany &&
    !!externalizedAdminDeptId &&
    userChiefDeptIds.includes(externalizedAdminDeptId);

  const supervisorApartadoSet = new Set(supervisorClientApartadoIds);
  function resolveCanValidate(apartado: ClientApartado): boolean {
    if (canValidateGlobal) return true;
    return supervisorApartadoSet.has(apartado.id);
  }

  // Estado optimista de la documentación (para que añadir/quitar supervisor
  // se vea de forma instantánea, igual que con técnicos en servicios).
  const [docState, setDocState] = useState<ClientDocumentation>(documentation);
  useEffect(() => setDocState(documentation), [documentation]);

  function findCandidateMember(profileId: string): DepartmentMember | undefined {
    for (const list of Object.values(assignableCatalog.membersByDept)) {
      const m = list.find((x) => x.id === profileId);
      if (m) return m;
    }
    return undefined;
  }

  function mutateApartado(
    clientApartadoId: string,
    fn: (a: ClientApartado) => ClientApartado
  ) {
    setDocState((prev) => ({
      ...prev,
      blocks: prev.blocks.map((b) => ({
        ...b,
        apartados: b.apartados.map((a) => (a.id === clientApartadoId ? fn(a) : a)),
      })),
    }));
  }

  function optimisticAddSupervisor(clientApartadoId: string, profileId: string) {
    const member = findCandidateMember(profileId);
    if (!member) return Promise.resolve();
    const snapshot = docState;
    mutateApartado(clientApartadoId, (a) =>
      a.supervisors.some((s) => s.id === profileId)
        ? a
        : {
            ...a,
            supervisors: [
              ...a.supervisors,
              {
                id: member.id,
                full_name: member.full_name,
                email: member.email,
                department_id: member.department_id,
                department_name: member.department_name,
              },
            ],
          }
    );
    addSupervisor({ companyId: detail.id, clientApartadoId, profileId }).catch(() => {
      setDocState(snapshot);
    });
    return Promise.resolve();
  }

  function optimisticRemoveSupervisor(clientApartadoId: string, profileId: string) {
    const snapshot = docState;
    mutateApartado(clientApartadoId, (a) => ({
      ...a,
      supervisors: a.supervisors.filter((s) => s.id !== profileId),
    }));
    removeSupervisor({ companyId: detail.id, clientApartadoId, profileId }).catch(() => {
      setDocState(snapshot);
    });
    return Promise.resolve();
  }

  function optimisticToggleOptional(clientApartadoId: string, isOptional: boolean) {
    const snapshot = docState;
    mutateApartado(clientApartadoId, (a) => ({ ...a, is_optional: isOptional }));
    setApartadoOptional({ companyId: detail.id, clientApartadoId, isOptional }).catch(() => {
      setDocState(snapshot);
    });
    return Promise.resolve();
  }

  // ---- Datos handlers ----
  async function handleSaveName() {
    setSavingName(true);
    try {
      await updateCompanyNameAdmin(company.id, nameValue || null);
      setCompany((prev) => ({ ...prev, company_name: nameValue || null }));
      setEditingName(false);
    } finally {
      setSavingName(false);
    }
  }

  // ---- Bank account handlers ----
  async function handleAddBank(iban: string, label: string | null, bankName: string | null) {
    const newAccount = await addCompanyBankAccountAdmin(company.id, iban, label, bankName);
    setBankAccounts((prev) => [...prev, newAccount]);
    setAddingBank(false);
  }

  async function handleUpdateBank(accountId: string, iban: string, label: string | null, bankName: string | null) {
    await updateCompanyBankAccountAdmin(company.id, accountId, iban, label, bankName);
    setBankAccounts((prev) =>
      prev.map((ba) =>
        ba.id === accountId
          ? { ...ba, iban: iban.replace(/\s/g, "").toUpperCase(), label, bank_name: bankName }
          : ba
      )
    );
    setEditingBankId(null);
  }

  async function handleDeleteBank(accountId: string) {
    setDeletingBankId(accountId);
    try {
      await deleteCompanyBankAccountAdmin(company.id, accountId);
      setBankAccounts((prev) => prev.filter((ba) => ba.id !== accountId));
    } finally {
      setDeletingBankId(null);
    }
  }

  // ---- Client account handlers ----
  async function handleAddAccount(input: { email: string; full_name: string | null }) {
    const created = await createClientAccount(company.id, input);
    setProfiles((prev) => {
      const exists = prev.some((p) => p.id === created.id);
      return exists ? prev : [...prev, created];
    });
    setAddingAccount(false);
  }

  async function handleUpdateAccount(profileId: string, input: { email: string; full_name: string | null }) {
    const updated = await updateClientAccount(profileId, input);
    setProfiles((prev) => prev.map((p) => (p.id === profileId ? updated : p)));
    setEditingAccountId(null);
  }

  async function handleConfirmUnlink(profileId: string) {
    await unlinkClientFromCompany(company.id, profileId);
    setProfiles((prev) => prev.filter((p) => p.id !== profileId));
    setUnlinkConfirmAccount(null);
  }

  // ---- Service handlers ----
  async function handleAddService(serviceId: string) {
    const svcMeta = chiefAvailableServices.find((s) => s.service_id === serviceId);
    if (!svcMeta) return;
    setSavingService(true);
    setServiceError(null);
    try {
      await addServiceToCompany(company.id, serviceId);
      const newService: ClienteService = {
        service_id: serviceId,
        service_name: svcMeta.service_name,
        service_slug: svcMeta.service_slug,
        department_id: svcMeta.department_id,
        department_name: deptMembers[svcMeta.department_id]?.[0] ? "" : "",
        technicians: [],
      };
      setCompany((prev) => ({ ...prev, services: [...prev.services, newService] }));
      setAddingService(false);
      router.refresh();
    } catch (e) {
      setServiceError(e instanceof Error ? e.message : "Error al añadir servicio");
    } finally {
      setSavingService(false);
    }
  }

  function handleRemoveService(serviceId: string) {
    const svc = company.services.find((s) => s.service_id === serviceId);
    if (!svc) return;
    setPendingRemoveService(svc);
  }

  async function confirmRemoveService() {
    if (!pendingRemoveService) return;
    try {
      await removeServiceFromCompany(company.id, pendingRemoveService.service_id);
      setCompany((prev) => ({
        ...prev,
        services: prev.services.filter((s) => s.service_id !== pendingRemoveService.service_id),
      }));
      setPendingRemoveService(null);
    } catch (e) {
      setServiceError(e instanceof Error ? e.message : "Error al quitar servicio");
      setPendingRemoveService(null);
    }
  }

  async function handleAssignTech(serviceId: string, techId: string) {
    const svc = company.services.find((s) => s.service_id === serviceId);
    if (!svc) return;
    // Buscar nombre en cualquier dpto o en allAdminCandidates.
    const member =
      Object.values(deptMembers)
        .flat()
        .find((m) => m.id === techId) ??
      allAdminCandidates.find((m) => m.id === techId);
    setCompany((prev) => ({
      ...prev,
      services: prev.services.map((s) =>
        s.service_id !== serviceId
          ? s
          : { ...s, technicians: [...s.technicians, { id: techId, name: member?.name ?? null }] }
      ),
    }));
    assignTechnicianAdmin(company.id, serviceId, techId).catch(() => {});
  }

  async function handleRemoveTech(serviceId: string, techId: string) {
    setCompany((prev) => ({
      ...prev,
      services: prev.services.map((s) =>
        s.service_id !== serviceId
          ? s
          : { ...s, technicians: s.technicians.filter((t) => t.id !== techId) }
      ),
    }));
    removeTechnicianAdmin(company.id, serviceId, techId).catch(() => {});
  }

  async function handleAssignAll(serviceId: string) {
    const svc = company.services.find((s) => s.service_id === serviceId);
    if (!svc) return;
    // Para servicios transversales no hay "asignar todos" — la pool sería
    // todos los admins, raramente deseable. Ignoramos el caso.
    if (!svc.department_id) return;
    const members = deptMembers[svc.department_id] ?? [];
    const existingIds = new Set(svc.technicians.map((t) => t.id));
    const toAdd = members.filter((m) => !existingIds.has(m.id));
    setCompany((prev) => ({
      ...prev,
      services: prev.services.map((s) =>
        s.service_id !== serviceId
          ? s
          : { ...s, technicians: [...s.technicians, ...toAdd.map((m) => ({ id: m.id, name: m.name }))] }
      ),
    }));
    assignAllTechniciansAdmin(company.id, serviceId, svc.department_id).catch(() => {});
  }

  // ---- Danger zone ----
  async function handleConfirmDelete(typedNif: string) {
    await deleteCompanyAdmin(company.id, typedNif);
    setShowDeleteModal(false);
    router.push(`${linkPrefix}/clientes`);
  }
  async function handleConfirmRestore() {
    await restoreCompanyAdmin(company.id);
    setShowRestoreConfirm(false);
    router.refresh();
  }

  return (
    <div className="animate-fade-in-up">
      {/* Sticky tabs. La cabecera (breadcrumb + h1 + NIF) la pinta la page
          como shell instantáneo (ClientHeaderShell) — no la repetimos aquí
          para evitar el doble header al llegar el workspace via streaming. */}
      <div className="sticky top-0 z-20 bg-surface-gray pt-2 pb-0">
        {/* Tabs */}
        <div className="border-b border-gray-200 flex items-center gap-4 flex-wrap">
          {TABS.map((t) => {
            const active = t.key === tab;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`text-sm font-medium pb-2 -mb-px border-b-2 transition-colors cursor-pointer ${
                  active
                    ? "border-brand-teal text-brand-navy"
                    : "border-transparent text-text-muted hover:text-text-body"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content wrapper */}
      <div className="mt-5 space-y-5">

      {/* ── Documentación ── */}
      {tab === "documentacion" && (
        <DocumentationMasterDetail
          data={docState}
          mode="admin"
          currentUserId={currentUserId}
          membersByDept={assignableCatalog.membersByDept}
          canManage={assignableCatalog.canRequest}
          resolveCanValidate={resolveCanValidate}
          handlers={{
            uploadFile: async (clientApartadoId, file) => {
              const base64 = await fileToBase64(file);
              await adminUploadApartadoFile({
                companyId: detail.id,
                clientApartadoId,
                fileName: file.name,
                fileBase64: base64,
                mimeType: file.type || "application/octet-stream",
              });
              router.refresh();
            },
            downloadFile: (fileId) => getApartadoFileSignedUrl(fileId),
            downloadTemplate: (templateId) => getApartadoTemplateSignedUrl(templateId),
            deleteFile: async (fileId) => {
              await adminSoftDeleteApartadoFile(fileId);
              router.refresh();
            },
            addComment: (clientApartadoId, body) =>
              addAdminComment(detail.id, clientApartadoId, body),
            validate: async (clientApartadoId) => {
              await validateApartado(detail.id, clientApartadoId);
              router.refresh();
            },
            reject: async (clientApartadoId, reason) => {
              await rejectApartado({ companyId: detail.id, clientApartadoId, reason });
              router.refresh();
            },
            reopen: async (clientApartadoId) => {
              await reopenApartado(detail.id, clientApartadoId);
              router.refresh();
            },
            addSupervisor: (clientApartadoId, profileId) =>
              optimisticAddSupervisor(clientApartadoId, profileId),
            removeSupervisor: (clientApartadoId, profileId) =>
              optimisticRemoveSupervisor(clientApartadoId, profileId),
            removeApartado: (clientApartadoId) =>
              removeApartadoFromClient(detail.id, clientApartadoId),
            removeBlock: async (clientBlockId) => {
              await removeBlockFromClient(detail.id, clientBlockId);
              router.refresh();
            },
            toggleOptional: (clientApartadoId, isOptional) =>
              optimisticToggleOptional(clientApartadoId, isOptional),
            submitForm: async (clientApartadoId, slug, payload) => {
              await adminSubmitFormApartado({
                companyId: detail.id,
                clientApartadoId,
                slug,
                payload,
              });
              router.refresh();
            },
            revealEnisaPassword: (clientApartadoId) =>
              getDecryptedEnisaPassword(clientApartadoId),
          }}
          onAddBlock={
            assignableCatalog.canRequest ? () => setAddingBlock(true) : undefined
          }
          onAddApartado={
            assignableCatalog.canRequest
              ? (clientBlockId, catalogBlockId) =>
                  setAddingApartado({ clientBlockId, blockId: catalogBlockId })
              : undefined
          }
          onRemindClient={async (comment) => {
            await remindClientDocumentation(detail.id, comment);
            router.refresh();
          }}
          getReminderPreview={(comment) =>
            getClientReminderPreviewHtml(detail.id, comment)
          }
        />
      )}

      {/* ── Equipo responsable ── */}
      {tab === "equipo" && (
        <ResponsibleTeamSection
          team={responsibleTeam}
          variant="expanded"
          loading={teamCandidatesLoading && teamData === null}
          manage={{
            canManage: (teamData?.manageableDeptIds.length ?? 0) > 0,
            candidates: teamData?.candidates ?? [],
            manageableDeptIds: teamData?.manageableDeptIds ?? [],
            onAdd: handleAddTeamMember,
            onRemove: handleRemoveTeamMember,
          }}
        />
      )}

      {/* ── Datos (incluye cuentas asociadas y cuentas bancarias) ── */}
      {tab === "datos" && (
        <div className="space-y-3">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Datos informativos</p>

            <Field label="Nombre legal" value={detail.legal_name} />

            {/* Nombre comercial — editable */}
            <div>
              <p className="text-xs text-text-muted mb-0.5">Nombre comercial</p>
              {editingName ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    type="text"
                    value={nameValue}
                    onChange={(e) => setNameValue(e.target.value)}
                    placeholder="Nombre comercial"
                    autoFocus
                    className="text-sm font-medium text-text-body border-b border-brand-teal/50 focus:outline-none focus:border-brand-teal bg-transparent flex-1 min-w-0"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSaveName();
                      if (e.key === "Escape") { setNameValue(company.company_name ?? ""); setEditingName(false); }
                    }}
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName}
                    className="text-xs text-brand-teal font-medium disabled:opacity-50 cursor-pointer"
                  >
                    {savingName ? "..." : "OK"}
                  </button>
                  <button
                    onClick={() => { setNameValue(company.company_name ?? ""); setEditingName(false); }}
                    className="text-xs text-text-muted cursor-pointer"
                  >
                    &times;
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 group/name">
                  <p className="text-sm font-medium text-text-body">{company.company_name || "—"}</p>
                  {canEditCompany && (
                    <button
                      onClick={() => setEditingName(true)}
                      className="opacity-0 group-hover/name:opacity-100 transition-opacity cursor-pointer"
                      title="Editar nombre comercial"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400 hover:text-brand-teal transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                      </svg>
                    </button>
                  )}
                </div>
              )}
            </div>

            <Field label="NIF / CIF" value={detail.nif ?? "—"} mono />
            <Field label="Fecha de alta en la plataforma" value={formatDate(detail.created_at)} />
          </div>

          {/* Cuentas asociadas */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Cuentas asociadas
                {profiles.length > 0 && (
                  <span className="ml-2 text-brand-teal font-semibold">{profiles.length}</span>
                )}
              </p>
              {canEditCompany && canManageClientAccounts && !addingAccount && (
                <button
                  onClick={() => { setAddingAccount(true); setEditingAccountId(null); }}
                  className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Añadir
                </button>
              )}
            </div>

            <div className="space-y-2">
              {profiles.length === 0 && !addingAccount && (
                <p className="text-sm text-text-muted">Sin cuentas asociadas</p>
              )}
              {profiles.map((acc) =>
                editingAccountId === acc.id ? (
                  <EditClientAccountForm
                    key={acc.id}
                    initial={acc}
                    onSave={(input) => handleUpdateAccount(acc.id, input)}
                    onCancel={() => setEditingAccountId(null)}
                  />
                ) : (
                  <div key={acc.id} className="bg-gray-50 rounded-lg px-4 py-3 flex items-center gap-3 group">
                    <div className="w-8 h-8 rounded-full bg-brand-teal/10 flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-brand-teal" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-text-body truncate">{acc.full_name ?? "Sin nombre"}</p>
                      <p className="text-xs text-text-muted truncate">{acc.email}</p>
                    </div>
                    {canEditCompany && canManageClientAccounts && (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => { setEditingAccountId(acc.id); setAddingAccount(false); }}
                          className="p-1 rounded hover:bg-gray-200 cursor-pointer"
                          title="Editar"
                        >
                          <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => setUnlinkConfirmAccount(acc)}
                          className="p-1 rounded hover:bg-red-100 cursor-pointer"
                          title="Desvincular"
                        >
                          <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
              {addingAccount && (
                <AddClientAccountForm
                  existingProfileIds={profiles.map((p) => p.id)}
                  onSubmit={handleAddAccount}
                  onCancel={() => setAddingAccount(false)}
                />
              )}
            </div>
          </div>

          {/* Cuentas bancarias — solo visibles para usuarios con manage_bank_accounts */}
          {canManageBankAccounts && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                  Cuentas bancarias
                  {bankAccounts.length > 0 && (
                    <span className="ml-2 text-brand-teal font-semibold">{bankAccounts.length}</span>
                  )}
                </p>
                {canEditCompany && !addingBank && (
                  <button
                    onClick={() => setAddingBank(true)}
                    className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Añadir
                  </button>
                )}
              </div>

              <div className="space-y-2">
                {bankAccounts.length === 0 && !addingBank && (
                  <p className="text-sm text-text-muted bg-gray-50 rounded-lg px-4 py-3">Sin cuentas bancarias</p>
                )}
                {bankAccounts.map((ba) =>
                  editingBankId === ba.id ? (
                    <BankAccountForm
                      key={ba.id}
                      initial={ba}
                      onSave={(iban, label, bankName) => handleUpdateBank(ba.id, iban, label, bankName)}
                      onCancel={() => setEditingBankId(null)}
                    />
                  ) : (
                    <div key={ba.id} className="bg-gray-50 rounded-lg px-4 py-3 group">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 mb-0.5">
                            {ba.label && <span className="text-xs font-medium text-brand-teal">{ba.label}</span>}
                            {ba.is_default && (
                              <span className="text-[10px] bg-brand-teal/10 text-brand-teal px-1.5 py-0.5 rounded-full font-medium">
                                Principal
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-mono text-text-body">{ba.iban.replace(/(.{4})/g, "$1 ").trim()}</p>
                          {ba.bank_name && <p className="text-xs text-text-muted mt-0.5">{ba.bank_name}</p>}
                        </div>
                        {canEditCompany && (
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={() => setEditingBankId(ba.id)}
                              className="p-1 rounded hover:bg-gray-200 cursor-pointer"
                              title="Editar"
                            >
                              <svg className="w-3.5 h-3.5 text-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteBank(ba.id)}
                              disabled={deletingBankId === ba.id}
                              className="p-1 rounded hover:bg-red-100 cursor-pointer disabled:opacity-50"
                              title="Eliminar"
                            >
                              <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                )}
                {addingBank && (
                  <BankAccountForm onSave={handleAddBank} onCancel={() => setAddingBank(false)} />
                )}
              </div>
            </div>
          )}

          {/* Zona de peligro */}
          {((isDeleted && canCreateCompany) || (!isDeleted && canDeleteCompany)) && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Zona de peligro
              </p>
              {isDeleted ? (
                <div className="flex items-center justify-between gap-3 bg-gray-50 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-text-body">Restaurar cliente</p>
                    <p className="text-xs text-text-muted mt-0.5">Volverá a estar activo y visible.</p>
                  </div>
                  <button
                    onClick={() => setShowRestoreConfirm(true)}
                    className="text-xs font-medium bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:bg-brand-teal/90 cursor-pointer flex-shrink-0"
                  >
                    Restaurar
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 bg-red-50/50 border border-red-100 rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm font-medium text-red-700">Dar de baja a cliente</p>
                    <p className="text-xs text-red-600/80 mt-0.5">
                      Queda inactivo pero se conserva el histórico. Se puede restaurar.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowDeleteModal(true)}
                    className="text-xs font-medium bg-red-500 text-white px-3 py-1.5 rounded-lg hover:bg-red-600 cursor-pointer flex-shrink-0"
                  >
                    Dar de baja
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Servicios contratados ── */}
      {tab === "servicios" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Servicios contratados
            </p>
            {canEditCompany && availableToAdd.length > 0 && !addingService && (
              <button
                onClick={() => setAddingService(true)}
                className="text-xs text-brand-teal hover:text-brand-teal/80 font-medium flex items-center gap-1 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Añadir
              </button>
            )}
          </div>

          {addingService && (
            <div className="flex items-center gap-2">
              <select
                onChange={(e) => { if (e.target.value) handleAddService(e.target.value); }}
                defaultValue=""
                disabled={savingService}
                className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-brand-teal/30 focus:border-brand-teal bg-white cursor-pointer disabled:opacity-50"
              >
                <option value="" disabled>Selecciona un servicio...</option>
                {availableToAdd.map((s) => (
                  <option key={s.service_id} value={s.service_id}>{s.service_name}</option>
                ))}
              </select>
              <button onClick={() => setAddingService(false)} className="text-xs text-text-muted hover:text-text-body cursor-pointer">
                Cancelar
              </button>
            </div>
          )}

          {serviceError && <p className="text-xs text-red-500">{serviceError}</p>}

          {company.services.length === 0 ? (
            <p className="text-sm text-text-muted italic">Sin servicios contratados</p>
          ) : (
            <div className="space-y-2">
              {company.services.map((svc): React.ReactNode => {
                const isTransversal = !svc.department_id;
                // Para servicios transversales, basta con tener
                // write_dept_service en algún dpto (= ser chief de algo).
                const isChiefOfDept = canEditCompany && (
                  isTransversal
                    ? userChiefDeptIds.length > 0
                    : userChiefDeptIds.includes(svc.department_id)
                );
                const memberGroups = buildMemberGroups({
                  isTransversal,
                  svcDeptId: svc.department_id,
                  deptMembers,
                  departments,
                  allAdminCandidates,
                });
                return (
                  <ServiceDetailSection
                    key={svc.service_id}
                    service={svc}
                    isChiefOfDept={isChiefOfDept}
                    memberGroups={memberGroups}
                    hideAssignAll={isTransversal}
                    companyId={company.id}
                    onAssign={handleAssignTech}
                    onRemove={handleRemoveTech}
                    onRemoveService={handleRemoveService}
                    onAssignAll={handleAssignAll}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Aplicaciones ── */}
      {tab === "aplicaciones" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Aplicaciones disponibles
          </p>
          <p className="text-xs text-text-muted">
            Donde cliente y equipo trabajan juntos.
          </p>

          {hasTaxAccountingAdvice && canViewClientTaxModels ? (
            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Modelos fiscales"
              description="Tramitación trimestral de modelos."
              unlockedBy="Asesoramiento fiscal y contable"
              href={`${linkPrefix}/modelos?company=${company.id}`}
              ctaLabel="Abrir modelos"
            />
          ) : hasTaxAccountingAdvice ? (
            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              }
              title="Modelos fiscales"
              description="Tramitación trimestral de modelos."
              unlockedBy="Asesoramiento fiscal y contable"
              noAccessHint="Sin permiso para acceder."
            />
          ) : (
            <EmptyFeaturesState
              message="Esta empresa todavía no tiene aplicaciones desbloqueadas."
              hint="Contrata 'Asesoramiento fiscal y contable' para habilitar Modelos fiscales."
            />
          )}
        </div>
      )}

      {/* ── Informes / Formularios ── */}
      {tab === "informes" && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">
            Informes y formularios
          </p>
          <p className="text-xs text-text-muted">
            Para consultar o rellenar una vez.
          </p>

          {hasExternalizedAdmin ? (
            <FeatureCard
              icon={
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.5V21a.5.5 0 00.5.5h6V13.5H3zM10.5 21.5h10a.5.5 0 00.5-.5v-7.5h-10.5V21.5zM3 12h18V3.5a.5.5 0 00-.5-.5h-17a.5.5 0 00-.5.5V12z" />
                </svg>
              }
              title="Dashboard fiscal"
              description="Ventas, compras y bancos al día."
              unlockedBy="Gestión administrativa externalizada"
              href={canViewClientDashboard ? `${linkPrefix}/clientes/${company.id}/dashboard` : undefined}
              ctaLabel={canViewClientDashboard ? "Abrir dashboard" : undefined}
              noAccessHint={!canViewClientDashboard ? "Sin permiso para acceder a esta vista del cliente." : undefined}
              extra={
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-2">
                    Configuración del Sheet
                  </p>
                  <DashboardSheetPanel
                    companyId={company.id}
                    initialConfig={dashboardConfig}
                    authorizedEmail={dashboardAuthorizedEmail}
                    canEdit={canEditDashboardSheet}
                  />
                </div>
              }
            />
          ) : (
            <EmptyFeaturesState
              message="Esta empresa todavía no tiene informes desbloqueados."
              hint="Contrata 'Gestión administrativa externalizada' para habilitar el Dashboard fiscal."
            />
          )}
        </div>
      )}

      </div>

      {addingBlock && (
        <AddBlockModal
          companyId={detail.id}
          assignable={assignableCatalog}
          onClose={() => setAddingBlock(false)}
          onSubmit={async (input) => {
            await addBlockToClient(input);
            setAddingBlock(false);
          }}
        />
      )}

      {addingApartado && (
        <AddApartadoModal
          companyId={detail.id}
          clientBlockId={addingApartado.clientBlockId}
          blockId={addingApartado.blockId}
          assignable={{ blocks: assignableCatalog.allBlocks, membersByDept: assignableCatalog.membersByDept }}
          excludeApartadoIds={
            documentation.blocks
              .find((b) => b.id === addingApartado.clientBlockId)
              ?.apartados.map((a) => a.apartado_id) ?? []
          }
          onClose={() => setAddingApartado(null)}
          onSubmit={async (input) => {
            await addApartadoToClient(input);
            setAddingApartado(null);
          }}
        />
      )}

      {showDeleteModal && (
        <DeleteCompanyModal
          legalName={detail.legal_name}
          nif={detail.nif ?? ""}
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}

      {showRestoreConfirm && (
        <ConfirmDialog
          title="Restaurar empresa"
          message={`¿Restaurar ${detail.legal_name}? Volverá a aparecer en los listados y podrá editarse de nuevo.`}
          confirmLabel="Restaurar"
          onConfirm={handleConfirmRestore}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}

      {unlinkConfirmAccount && (
        <ConfirmDialog
          title="Desvincular cuenta"
          message={`¿Desvincular ${unlinkConfirmAccount.full_name ?? unlinkConfirmAccount.email} de esta empresa? La cuenta seguirá existiendo y podrás volver a vincularla más tarde.`}
          confirmLabel="Desvincular"
          destructive
          onConfirm={() => handleConfirmUnlink(unlinkConfirmAccount.id)}
          onCancel={() => setUnlinkConfirmAccount(null)}
        />
      )}

      {pendingRemoveService && (
        <ConfirmDialog
          title="Quitar servicio"
          message={`¿Quitar el servicio "${pendingRemoveService.service_name}" de este cliente?`}
          confirmLabel="Quitar"
          destructive
          onConfirm={confirmRemoveService}
          onCancel={() => setPendingRemoveService(null)}
        />
      )}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-text-muted">{label}</p>
      <p className={`text-sm font-medium text-text-body mt-0.5 ${mono ? "font-mono" : ""}`}>{value}</p>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
  unlockedBy,
  href,
  ctaLabel,
  noAccessHint,
  extra,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  unlockedBy: string;
  href?: string;
  ctaLabel?: string;
  /** Texto que reemplaza al CTA cuando el actor no tiene permiso. */
  noAccessHint?: string;
  /** Contenido extra que se renderiza dentro del mismo box, debajo del header. */
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-100 p-4 hover:border-brand-teal/40 transition-colors">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-brand-teal/10 text-brand-teal flex items-center justify-center">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-brand-navy">{title}</h4>
          <p className="text-xs text-text-muted mt-0.5">{description}</p>
          <p className="text-[11px] text-text-muted/80 mt-1.5">
            Desbloqueada por{" "}
            <span className="font-medium text-text-muted">{unlockedBy}</span>
          </p>
          {noAccessHint && (
            <p className="text-[11px] text-text-muted/80 italic mt-1">
              {noAccessHint}
            </p>
          )}
        </div>
        {href && ctaLabel && (
          <a
            href={href}
            className="flex-shrink-0 self-center inline-flex items-center gap-1.5 text-xs font-medium bg-brand-teal text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
          >
            {ctaLabel}
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </a>
        )}
      </div>
      {extra}
    </div>
  );
}

function EmptyFeaturesState({
  message,
  hint,
}: {
  message: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
      <p className="text-sm text-text-muted">{message}</p>
      <p className="text-xs text-text-muted/80 mt-1">{hint}</p>
    </div>
  );
}

export type { ClientDocumentation };
