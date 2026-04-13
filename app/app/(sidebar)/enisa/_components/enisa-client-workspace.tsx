"use client";

import { useState, useEffect, useCallback } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { getEnisaData, submitDocumentation } from "../actions";
import DocumentBox from "./document-box";
import CredentialsBox from "./credentials-box";
import SubmitButton from "./submit-button";
import ContactButton from "./contact-button";

type StatusFilter = "all" | "rejected" | "draft" | "submitted" | "validated";

const FILTER_CONFIG: { key: StatusFilter; label: string; activeClass: string; inactiveClass: string }[] = [
  { key: "all", label: "Todos", activeClass: "bg-brand-navy text-white border-brand-navy", inactiveClass: "bg-white text-text-body border-gray-200 hover:bg-gray-50" },
  { key: "rejected", label: "Rechazado", activeClass: "bg-red-500 text-white border-red-500", inactiveClass: "bg-white text-red-700 border-red-200 hover:bg-red-50" },
  { key: "draft", label: "Pendiente", activeClass: "bg-amber-500 text-white border-amber-500", inactiveClass: "bg-white text-amber-700 border-amber-200 hover:bg-amber-50" },
  { key: "submitted", label: "Enviado", activeClass: "bg-blue-500 text-white border-blue-500", inactiveClass: "bg-white text-blue-700 border-blue-200 hover:bg-blue-50" },
  { key: "validated", label: "Validado", activeClass: "bg-green-500 text-white border-green-500", inactiveClass: "bg-white text-green-700 border-green-200 hover:bg-green-50" },
];

export default function EnisaClientWorkspace() {
  const [boxes, setBoxes] = useState<EnisaBoxData[]>([]);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [lastSubmittedAt, setLastSubmittedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [credUsername, setCredUsername] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [advisorEmails, setAdvisorEmails] = useState<string[]>([]);
  const [companyName, setCompanyName] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const loadData = useCallback(async () => {
    try {
      const data = await getEnisaData();
      setBoxes(data.boxes);
      setHasSubmitted(data.hasSubmitted);
      setLastSubmittedAt(data.lastSubmittedAt);
      setAdvisorEmails(data.advisorEmails);
      setCompanyName(data.companyName);

      const credBox = data.boxes.find((b) => b.isCredentials);
      if (credBox?.credentials) {
        setCredUsername(credBox.credentials.username ?? "");
        setCredPassword(credBox.credentials.password ?? "");
      }
    } catch (err) {
      console.error("Error loading ENISA data:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await submitDocumentation({
        username: credUsername,
        password: credPassword,
      });
      await loadData();
    } catch (err) {
      console.error("Error submitting:", err);
      alert(err instanceof Error ? err.message : "Error al enviar la documentación.");
    } finally {
      setSubmitting(false);
    }
  }

  // Check if there's anything to submit
  const hasUnsubmittedContent = boxes.some((box) => {
    if (box.status === "validated") return false;
    if (box.isCredentials) {
      const hasTypedCreds = credUsername.trim() !== "" || credPassword.trim() !== "";
      if (!hasTypedCreds) return false;
      if (!box.credentials) return true;
      if (!box.credentials.is_submitted) return true;
      return (
        credUsername.trim() !== (box.credentials.username ?? "") ||
        credPassword.trim() !== (box.credentials.password ?? "")
      );
    }
    return box.documents.some((d) => !d.is_submitted);
  });

  const allValidated = boxes.every((box) => box.status === "validated");

  if (loading) {
    return <LoadingSkeleton />;
  }

  const renderBox = (box: EnisaBoxData) =>
    box.isCredentials ? (
      <CredentialsBox
        key={box.typeKey}
        box={box}
        username={credUsername}
        password={credPassword}
        onUsernameChange={setCredUsername}
        onPasswordChange={setCredPassword}
      />
    ) : (
      <DocumentBox key={box.typeKey} box={box} onUpdate={loadData} />
    );

  const counts = {
    all: boxes.length,
    rejected: boxes.filter((b) => b.status === "rejected").length,
    draft: boxes.filter((b) => b.status === "draft").length,
    submitted: boxes.filter((b) => b.status === "submitted").length,
    validated: boxes.filter((b) => b.status === "validated").length,
  };

  const filtered =
    statusFilter === "all" ? boxes : boxes.filter((b) => b.status === statusFilter);

  return (
    <div className="px-4 sm:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="sticky top-0 bg-surface-gray z-20 pt-8 sm:pt-12 pb-4 border-b border-gray-200 space-y-4">
          <h1 className="font-heading text-2xl text-brand-navy">
            Documentación ENISA
          </h1>

          {allValidated && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 text-green-800 text-sm">
              Toda la documentación ha sido validada. No es necesario realizar ninguna acción adicional.
            </div>
          )}

          {hasSubmitted && lastSubmittedAt && !allValidated && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-blue-800 text-sm">
              Documentación enviada el{" "}
              {new Date(lastSubmittedAt).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "long",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Puedes seguir adjuntando documentos y volver a enviar.
            </div>
          )}

          {!allValidated && (
            <div className="flex flex-col sm:flex-row items-center gap-4">
              <SubmitButton
                onSubmit={handleSubmit}
                submitting={submitting}
                disabled={!hasUnsubmittedContent}
                hasSubmitted={hasSubmitted}
              />
              <ContactButton emails={advisorEmails} companyName={companyName} />
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
        </div>

        <div className="pt-4 pb-12">
          {filtered.length === 0 ? (
            <div className="bg-white border border-gray-200 rounded-xl p-8 text-center text-sm text-text-muted">
              No hay apartados en este estado.
            </div>
          ) : (
            <div className="space-y-3">{filtered.map(renderBox)}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="px-4 sm:px-8 pt-8 sm:pt-12 pb-12 max-w-4xl mx-auto space-y-6 animate-pulse">
      {/* Buttons placeholder */}
      <div className="flex gap-4">
        <div className="h-11 bg-gray-200 rounded-xl w-52" />
        <div className="h-11 bg-gray-100 rounded-xl w-44" />
      </div>
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="h-5 bg-gray-200 rounded w-3/4 mb-3" />
          <div className="h-4 bg-gray-100 rounded w-full mb-4" />
          <div className="h-20 bg-gray-50 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
