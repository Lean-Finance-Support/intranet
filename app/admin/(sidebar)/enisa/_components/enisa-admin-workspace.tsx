"use client";

import { useCallback, useEffect, useState } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import type { EnisaCompany } from "../actions";
import { getCompanyEnisaData } from "../actions";
import ClientSearch from "./client-search";
import DocumentReviewBox from "./document-review-box";
import CredentialsReviewBox from "./credentials-review-box";
import NotifyWelcomeButton from "./notify-welcome-button";
import NotifyUpdateButton from "./notify-update-button";
import DownloadAllButton from "./download-all-button";

type StatusFilter = "all" | "rejected" | "draft" | "submitted" | "validated";

const FILTER_CONFIG: { key: StatusFilter; label: string; activeClass: string; inactiveClass: string }[] = [
  { key: "all", label: "Todos", activeClass: "bg-brand-navy text-white border-brand-navy", inactiveClass: "bg-white text-text-body border-gray-200 hover:bg-gray-50" },
  { key: "rejected", label: "Rechazado", activeClass: "bg-red-500 text-white border-red-500", inactiveClass: "bg-white text-red-700 border-red-200 hover:bg-red-50" },
  { key: "draft", label: "Pendiente", activeClass: "bg-amber-500 text-white border-amber-500", inactiveClass: "bg-white text-amber-700 border-amber-200 hover:bg-amber-50" },
  { key: "submitted", label: "Revisión", activeClass: "bg-blue-500 text-white border-blue-500", inactiveClass: "bg-white text-blue-700 border-blue-200 hover:bg-blue-50" },
  { key: "validated", label: "Validado", activeClass: "bg-green-500 text-white border-green-500", inactiveClass: "bg-white text-green-700 border-green-200 hover:bg-green-50" },
];

export default function EnisaAdminWorkspace({ initialCompanyId }: { initialCompanyId?: string }) {
  const [selectedCompany, setSelectedCompany] = useState<EnisaCompany | null>(null);
  const [boxes, setBoxes] = useState<EnisaBoxData[]>([]);
  const [welcomeEmailSent, setWelcomeEmailSent] = useState(false);
  const [welcomeEmailSentAt, setWelcomeEmailSentAt] = useState<string | null>(null);
  const [lastUpdateSentAt, setLastUpdateSentAt] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const companyId = selectedCompany?.id;

  const loadData = useCallback(async () => {
    if (!companyId) return;
    try {
      const data = await getCompanyEnisaData(companyId);
      setBoxes(data.boxes);
      setWelcomeEmailSent(data.welcomeEmailSent);
      setWelcomeEmailSentAt(data.welcomeEmailSentAt);
      setLastUpdateSentAt(data.lastUpdateSentAt);
      setUpdateCount(data.updateCount);
      setLastSubmittedAt(data.lastSubmittedAt);
    } catch (err) {
      console.error("Error loading ENISA data:", err);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (!companyId) {
      setBoxes([]);
      setWelcomeEmailSent(false);
      setWelcomeEmailSentAt(null);
      setLastUpdateSentAt(null);
      setUpdateCount(0);
      setLastSubmittedAt(null);
      setStatusFilter("all");
      return;
    }
    setLoading(true);
    loadData();
  }, [companyId, loadData]);

  const totalDocs = boxes.reduce((sum, b) => sum + b.documents.length, 0);
  const validatedCount = boxes.filter((b) => b.status === "validated").length;
  const submittedCount = boxes.filter((b) => b.status === "submitted").length;
  const rejectedCount = boxes.filter((b) => b.status === "rejected").length;

  const counts = {
    all: boxes.length,
    rejected: boxes.filter((b) => b.status === "rejected").length,
    draft: boxes.filter((b) => b.status === "draft").length,
    submitted: boxes.filter((b) => b.status === "submitted").length,
    validated: boxes.filter((b) => b.status === "validated").length,
  };

  const filtered =
    statusFilter === "all" ? boxes : boxes.filter((b) => b.status === statusFilter);

  const renderBox = (box: EnisaBoxData) =>
    box.isCredentials ? (
      <CredentialsReviewBox
        key={box.typeKey}
        box={box}
        companyId={selectedCompany!.id}
        canEdit={selectedCompany!.canEdit}
        onUpdate={loadData}
      />
    ) : (
      <DocumentReviewBox
        key={box.typeKey}
        box={box}
        companyId={selectedCompany!.id}
        canEdit={selectedCompany!.canEdit}
        onUpdate={loadData}
      />
    );

  return (
    <div className="px-4 sm:px-8">
      <div className="max-w-5xl mx-auto">
        <div className="sticky top-0 bg-surface-gray z-20 pt-8 sm:pt-12 pb-4 border-b border-gray-200 space-y-6">
          <h1 className="font-heading text-2xl text-brand-navy">
            Documentación ENISA
          </h1>
          <ClientSearch
            selected={selectedCompany}
            onSelect={setSelectedCompany}
            onClear={() => setSelectedCompany(null)}
            initialCompanyId={initialCompanyId}
          />

          {selectedCompany && !loading && (
            <>
              <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
                <div className="flex flex-col items-center lg:flex-row lg:items-center lg:justify-between gap-4 lg:gap-6">
                  <div className="flex flex-wrap items-center justify-center lg:justify-start gap-3">
                    {selectedCompany.canEdit ? (
                      <>
                        <NotifyWelcomeButton
                          companyId={selectedCompany.id}
                          alreadySent={welcomeEmailSent}
                          sentAt={welcomeEmailSentAt}
                          onSent={loadData}
                        />
                        {welcomeEmailSent && (
                          <>
                            <div className="hidden lg:block w-px self-stretch bg-gray-200" />
                            <NotifyUpdateButton
                              companyId={selectedCompany.id}
                              lastSentAt={lastUpdateSentAt}
                              updateCount={updateCount}
                              onSent={loadData}
                            />
                          </>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                        </svg>
                        <span className="text-sm text-text-muted">Solo lectura — no estás asignado como técnico de esta empresa</span>
                      </div>
                    )}
                  </div>
                  <DownloadAllButton companyId={selectedCompany.id} hasDocuments={totalDocs > 0} />
                </div>
              </div>

              {lastSubmittedAt && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-800 text-sm flex flex-wrap items-center gap-4">
                  <span>
                    Último envío: {new Date(lastSubmittedAt).toLocaleDateString("es-ES", {
                      day: "numeric",
                      month: "long",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <div className="flex items-center gap-3 text-xs">
                    {validatedCount > 0 && (
                      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                        {validatedCount} validados
                      </span>
                    )}
                    {submittedCount > 0 && (
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                        {submittedCount} pendientes de revisión
                      </span>
                    )}
                    {rejectedCount > 0 && (
                      <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">
                        {rejectedCount} rechazados
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                {FILTER_CONFIG.map((f) => {
                  const active = statusFilter === f.key;
                  return (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => setStatusFilter(f.key)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors ${
                        active ? f.activeClass : f.inactiveClass
                      }`}
                    >
                      {f.label}
                      <span
                        className={`inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 rounded-full text-[10px] font-bold ${
                          active ? "bg-white/20 text-white" : "bg-gray-100 text-text-muted"
                        }`}
                      >
                        {counts[f.key]}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {selectedCompany && (
          <div className="pt-6 pb-12">
            {loading ? (
              <div className="space-y-4 animate-pulse">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
                    <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
                    <div className="h-16 bg-gray-50 rounded" />
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-text-muted">
                No hay apartados en este estado.
              </div>
            ) : (
              <div className="space-y-3">{filtered.map(renderBox)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
