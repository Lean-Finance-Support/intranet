"use client";

import { useState, useEffect, useCallback } from "react";
import type { EnisaBoxData } from "@/lib/types/enisa";
import { getEnisaData, submitDocumentation } from "../actions";
import DocumentBox from "./document-box";
import CredentialsBox from "./credentials-box";
import SubmitButton from "./submit-button";
import ContactButton from "./contact-button";

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

  return (
    <div className="space-y-6">
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

      {boxes.map((box) =>
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
        )
      )}
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
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
