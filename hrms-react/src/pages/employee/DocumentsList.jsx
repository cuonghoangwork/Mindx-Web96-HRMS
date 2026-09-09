import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate } from "../../utils/format";
import Button from "../../components/Button";
import { translateApiError } from "../../utils/apiError";

// Solo Gaps Milestone 1 — keep in sync with
// hrms-backend/middleware/upload.js's uploadDocuments
const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

const DOCUMENT_TYPES = ["offer_letter", "id_scan", "other"];

// Solo Gaps Milestone 1 — arbitrary multi-document upload (offer letters,
// ID scans, other), additive alongside ContractCard above. Modeled on it
// for the upload-state/error handling, but list-shaped since there can be
// several documents at once, each individually viewable/deletable.
export function DocumentsList({ employee, canManage, uploadEmployeeDocuments, removeEmployeeDocument, embedded = false }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [docType, setDocType] = useState("other");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState(null);
  const fileInputRef = useRef(null);

  const typeLabel = (type) => {
    if (type === "offer_letter") return t("documents.typeOfferLetter");
    if (type === "id_scan") return t("documents.typeIdScan");
    return t("documents.typeOther");
  };

  const handlePick = () => fileInputRef.current?.click();

  const closeAddForm = () => {
    setAdding(false);
    setLabel("");
    setDocType("other");
  };

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;

    if (files.length > 5) {
      setError(t("documents.tooManyError"));
      return;
    }
    if (files.some((f) => f.type !== "application/pdf")) {
      setError(t("documents.typeError"));
      return;
    }
    if (files.some((f) => f.size > MAX_DOCUMENT_BYTES)) {
      setError(t("documents.sizeError"));
      return;
    }

    setError("");
    setUploading(true);
    try {
      await uploadEmployeeDocuments(employee.id, files, { label, type: docType });
      closeAddForm();
    } catch (err) {
      setError(translateApiError(err, t) || t("documents.uploadError", { defaultValue: "Failed to upload document(s)." }));
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (docId) => {
    if (!confirm(t("documents.deleteConfirm"))) return;
    setError("");
    setDeletingId(docId);
    try {
      await removeEmployeeDocument(employee.id, docId);
    } catch (err) {
      setError(translateApiError(err, t) || t("documents.deleteError", { defaultValue: "Failed to delete document." }));
    } finally {
      setDeletingId(null);
    }
  };

  const documents = employee.documents || [];

  return (
    <div className={embedded ? undefined : "content-card"} style={{ marginTop: "var(--sp-5)" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--sp-3)", flexWrap: "wrap" }}>
        <h3 style={{ fontSize: "var(--fs-lg)", fontWeight: "var(--fw-semibold)", margin: 0 }}>
          {t("documents.title")}
        </h3>
        {canManage && !adding && (
          <Button variant="primary" size="sm" onClick={() => setAdding(true)}>
            {t("documents.addDocument")}
          </Button>
        )}
      </div>

      {canManage && adding && (
        <div style={{ display: "flex", gap: "var(--sp-3)", flexWrap: "wrap", alignItems: "flex-end", marginTop: "var(--sp-3)" }}>
          <div className="form-group" style={{ marginBottom: 0, minWidth: "180px" }}>
            <label>{t("documents.labelPlaceholder")}</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t("documents.labelPlaceholder")}
            />
          </div>
          <div className="form-group" style={{ marginBottom: 0, minWidth: "150px" }}>
            <label>{t("documents.typeFieldLabel")}</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)}>
              {DOCUMENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {typeLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "var(--sp-2)" }}>
            <Button variant="secondary" size="sm" onClick={handlePick} disabled={uploading} loading={uploading}>
              {uploading ? t("documents.uploading") : t("documents.chooseFiles")}
            </Button>
            <Button variant="ghost" size="sm" onClick={closeAddForm} disabled={uploading}>
              {t("documents.cancel")}
            </Button>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            multiple
            onChange={handleFileChange}
            style={{ display: "none" }}
          />
        </div>
      )}

      {error && (
        <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {error}
        </p>
      )}

      <div style={{ marginTop: "var(--sp-4)", display: "flex", flexDirection: "column", gap: "var(--sp-2)" }}>
        {documents.length === 0 && (
          <p style={{ fontSize: "var(--fs-sm)", color: "var(--txt-secondary)" }}>{t("documents.noDocuments")}</p>
        )}
        {documents.map((doc) => (
          <div
            key={doc.id}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--sp-3)",
              padding: "var(--sp-2) 0",
              borderBottom: "1px solid var(--bdr-subtle)",
            }}
          >
            <div>
              <div style={{ fontSize: "var(--fs-sm)", fontWeight: "var(--fw-medium)" }}>
                {doc.label || typeLabel(doc.type)}
              </div>
              <div style={{ fontSize: "var(--fs-xs)", color: "var(--txt-secondary)" }}>
                {typeLabel(doc.type)} · {formatDate(doc.uploadedAt, language)}
              </div>
            </div>
            <div style={{ display: "flex", gap: "var(--sp-2)" }}>
              <a href={doc.url} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm">
                {t("documents.view")}
              </a>
              {canManage && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(doc.id)}
                  loading={deletingId === doc.id}
                >
                  {t("documents.delete")}
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
