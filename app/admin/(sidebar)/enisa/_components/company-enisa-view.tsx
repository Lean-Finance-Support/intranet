"use client";

import { useState, useEffect, useCallback } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import type { EnisaCompany } from "../actions";
import { getCompanyEnisaData } from "../actions";
import DocumentReviewBox from "./document-review-box";
import CredentialsReviewBox from "./credentials-review-box";
import NotifyWelcomeButton from "./notify-welcome-button";
import NotifyUpdateButton from "./notify-update-button";
import DownloadAllButton from "./download-all-button";

interface CompanyEnisaViewProps {
  company: EnisaCompany;
}

export default function CompanyEnisaView({ company }: CompanyEnisaViewProps) {
  const [boxes, setBoxes] = useState<EnisaBoxData[]>([]);
  const [welcomeEmailSent, setWelcomeEmailSent] = useState(false);
  const [welcomeEmailSentAt, setWelcomeEmailSentAt] = useState<string | null>(null);
  const [lastUpdateSentAt, setLastUpdateSentAt] = useState<string | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const data = await getCompanyEnisaData(company.id);
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
  }, [company.id]);

  useEffect(() => {
    setLoading(true);
    loadData();
  }, [loadData]);

  const totalDocs = boxes.reduce((sum, b) => sum + b.documents.length, 0);
  const validatedCount = boxes.filter((b) => b.status === "validated").length;
  const submittedCount = boxes.filter((b) => b.status === "submitted").length;
  const rejectedCount = boxes.filter((b) => b.status === "rejected").length;

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="h-4 bg-gray-200 rounded w-2/3 mb-3" />
            <div className="h-16 bg-gray-50 rounded" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top actions bar */}
      <div className="bg-white rounded-xl border border-gray-200 px-5 py-4">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <NotifyWelcomeButton
              companyId={company.id}
              alreadySent={welcomeEmailSent}
              sentAt={welcomeEmailSentAt}
              onSent={loadData}
            />
            {welcomeEmailSent && (
              <>
                <div className="w-px self-stretch bg-gray-200" />
                <NotifyUpdateButton
                  companyId={company.id}
                  lastSentAt={lastUpdateSentAt}
                  updateCount={updateCount}
                  onSent={loadData}
                />
              </>
            )}
          </div>
          <DownloadAllButton companyId={company.id} hasDocuments={totalDocs > 0} />
        </div>
      </div>

      {/* Status summary */}
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

      {/* Document boxes */}
      {boxes.map((box) =>
        box.isCredentials ? (
          <CredentialsReviewBox
            key={box.typeKey}
            box={box}
            companyId={company.id}
            canEdit={company.canEdit}
            onUpdate={loadData}
          />
        ) : (
          <DocumentReviewBox
            key={box.typeKey}
            box={box}
            companyId={company.id}
            canEdit={company.canEdit}
            onUpdate={loadData}
          />
        )
      )}
    </div>
  );
}
