/**
 * The one HTML shell every notification email uses. Email clients are not
 * browsers: inline styles only (Gmail strips <style>; Outlook renders with
 * Word), tables for layout (no flexbox in Outlook), a real font stack with
 * no webfont (Archivo first, then fallbacks — an @import may never load),
 * and everything escaped, since copy interpolates employee names.
 */

const BRAND = "#1359e1";
const INK = "#111827";
const MUTED = "#6b7280";
const HAIRLINE = "#e5e7eb";
const FONT = "Archivo, -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif";

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

/**
 * @param {object} input
 * @param {string} input.title
 * @param {string} input.message
 * @param {string} [input.url]       absolute link; omitted => no button
 * @param {string} [input.urlLabel]
 * @param {string} [input.footer]    e.g. how to turn these emails off
 * @returns {{ html: string, text: string }}
 */
export function renderEmail({ title, message, url, urlLabel, footer }) {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);

  const button = url
    ? `
            <tr>
              <td style="padding:24px 0 0;">
                <a href="${escapeHtml(url)}" style="display:inline-block;padding:11px 20px;background:${BRAND};color:#ffffff;font-family:${FONT};font-size:14px;font-weight:600;text-decoration:none;border-radius:6px;">${escapeHtml(urlLabel || "Open")}</a>
              </td>
            </tr>`
    : "";

  const footerRow = footer
    ? `
            <tr>
              <td style="padding:24px 0 0;border-top:1px solid ${HAIRLINE};">
                <p style="margin:16px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${MUTED};">${escapeHtml(footer)}</p>
              </td>
            </tr>`
    : "";

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid ${HAIRLINE};border-radius:10px;padding:28px;">
            <tr>
              <td style="padding:0 0 20px;">
                <span style="font-family:${FONT};font-size:13px;font-weight:700;letter-spacing:0.08em;color:${BRAND};text-transform:uppercase;">HRMS</span>
              </td>
            </tr>
            <tr>
              <td>
                <h1 style="margin:0;font-family:${FONT};font-size:19px;line-height:26px;font-weight:600;color:${INK};">${safeTitle}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:10px 0 0;">
                <p style="margin:0;font-family:${FONT};font-size:15px;line-height:23px;color:${INK};">${safeMessage}</p>
              </td>
            </tr>${button}${footerRow}
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [title, "", message, url ? `\n${urlLabel || "Open"}: ${url}` : "", footer ? `\n${footer}` : ""]
    .filter((part) => part !== "")
    .join("\n")
    .trim();

  return { html, text };
}

export default renderEmail;
