import { useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useLanguage } from "../../context/LanguageContext";
import { formatDate } from "../../utils/format";
import Button from "../../components/Button";
import { translateApiError } from "../../utils/apiError";

// Task 1.4 — keep in sync with hrms-backend/middleware/upload.js's uploadPdf
const MAX_CONTRACT_BYTES = 10 * 1024 * 1024;

export function ContractCard({ employee, canManage, uploadEmployeeContract, embedded = false }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const handlePick = () => fileInputRef.current?.click();

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (file.type !== "application/pdf") {
      setError(t("employees.viewEmployee.contractCard.errors.typeError", { defaultValue: "Please choose a PDF file." }));
      return;
    }
    if (file.size > MAX_CONTRACT_BYTES) {
      setError(t("employees.viewEmployee.contractCard.errors.sizeError", { defaultValue: "Contract must be 10MB or smaller." }));
      return;
    }

    setError("");
    setUploading(true);
    try {
      await uploadEmployeeContract(employee.id, file);
    } catch (err) {
      setError(translateApiError(err, t) || t("employees.viewEmployee.contractCard.errors.uploadFailed", { defaultValue: "Failed to upload contract." }));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className={embedded ? undefined : "content-card"} style={embedded ? undefined : { marginTop: "20px" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--sp-3)",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h3 className="panel-title">
            {t("employees.viewEmployee.contractCard.title", { defaultValue: "Contract" })}
          </h3>
          <p className="hint-sm">
            {employee.contractUrl
              ? t("employees.viewEmployee.contractCard.uploaded", { defaultValue: "Uploaded {{date}}", date: formatDate(employee.contractUploadedAt, language) })
              : t("employees.viewEmployee.contractCard.noContract", { defaultValue: "No contract on file yet." })}
          </p>
        </div>

        <div style={{ display: "flex", gap: "var(--sp-2)" }}>
          {employee.contractUrl && (
            <a
              href={employee.contractUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-secondary btn-sm"
            >
              {t("employees.viewEmployee.contractCard.viewContract", { defaultValue: "View Contract" })}
            </a>
          )}
          {canManage && (
            <>
              <Button
                variant="primary"
                size="sm"
                onClick={handlePick}
                disabled={uploading}
              >
                {uploading ? t("employees.viewEmployee.contractCard.uploading", { defaultValue: "Uploading…" }) : employee.contractUrl ? t("employees.viewEmployee.contractCard.replace", { defaultValue: "Replace Contract" }) : t("employees.viewEmployee.contractCard.upload", { defaultValue: "Upload Contract" })}
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />
            </>
          )}
        </div>
      </div>

      {error && (
        <p style={{ color: "var(--txt-danger)", fontSize: "var(--fs-xs)", marginTop: "var(--sp-3)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
