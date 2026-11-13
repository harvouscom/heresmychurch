// One branded layout for every email Here's My Church sends. Table-based with inline styles so it
// renders the same in Gmail, Outlook and Apple Mail, on a light card so dark-mode inversion stays
// readable. Every message also has a plain-text version, sent alongside.
export type EmailMessage = {
  subject: string;
  /** Inbox preview line. */
  preheader: string;
  heading: string;
  paragraphs: string[];
  button?: { label: string; url: string };
  /** Label/value rows, e.g. the suggestions waiting for a church. */
  details?: { label: string; value: string; note?: string }[];
  /** Small print under the button: expiry, why you got this. */
  note?: string;
  /** Unsubscribe-style link for recurring requests. */
  stop?: { label: string; url: string };
};

const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailText(m: EmailMessage): string {
  const lines = [m.heading, "", ...m.paragraphs.flatMap(p => [p, ""])];
  if (m.details?.length) { for (const d of m.details) lines.push(`${d.label}: ${d.value}${d.note ? ` (${d.note})` : ""}`); lines.push(""); }
  if (m.button) lines.push(`${m.button.label}:`, m.button.url, "");
  if (m.note) lines.push(m.note, "");
  if (m.stop) lines.push(`${m.stop.label}: ${m.stop.url}`, "");
  lines.push("Here’s My Church · A community-built map of churches", "https://heresmychurch.com");
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function emailHtml(m: EmailMessage, site = "https://heresmychurch.com"): string {
  const font = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const details = m.details?.length ? `
          <tr><td style="padding:4px 32px 8px">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;border:1px solid #ece4f7;border-radius:12px;background:#faf7fe">
              ${m.details.map((d, i) => `<tr><td style="padding:12px 16px;${i ? "border-top:1px solid #ece4f7;" : ""}font:500 12px/1.4 ${font};color:#7a6694;width:34%;vertical-align:top">${esc(d.label)}</td><td style="padding:12px 16px;${i ? "border-top:1px solid #ece4f7;" : ""}font:14px/1.5 ${font};color:#241736;vertical-align:top;word-break:break-word">${esc(d.value)}${d.note ? `<div style="font:12px/1.5 ${font};color:#8a7aa1;margin-top:2px">${esc(d.note)}</div>` : ""}</td></tr>`).join("")}
            </table>
          </td></tr>` : "";
  const button = m.button ? `
          <tr><td style="padding:16px 32px 4px">
            <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#6b3fc0">
              <a href="${esc(m.button.url)}" style="display:inline-block;padding:13px 24px;font:600 15px/1 ${font};color:#ffffff;text-decoration:none;border-radius:10px">${esc(m.button.label)}</a>
            </td></tr></table>
          </td></tr>` : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(m.subject)}</title></head>
<body style="margin:0;padding:0;background:#f4effa;-webkit-text-size-adjust:100%">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${esc(m.preheader)}&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4effa">
    <tr><td align="center" style="padding:32px 16px">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px">
        <tr><td style="padding:0 8px 18px">
          <a href="${esc(site)}" style="text-decoration:none"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
            <td style="vertical-align:middle"><img src="${esc(site)}/email/icon-96.png" width="36" height="36" alt="" style="display:block;border:0;border-radius:10px"></td>
            <td style="vertical-align:middle;padding-left:10px;font:600 16px/1 ${font};color:#2a1840;letter-spacing:-.01em">Here’s My Church</td>
          </tr></table></a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:18px;border:1px solid #e8def4;box-shadow:0 1px 2px rgba(42,24,64,.04)">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:30px 32px 6px;font:600 22px/1.3 ${font};color:#1f1330;letter-spacing:-.015em">${esc(m.heading)}</td></tr>
            ${m.paragraphs.map(p => `<tr><td style="padding:8px 32px;font:15px/1.65 ${font};color:#4a3b5e">${esc(p)}</td></tr>`).join("")}
            ${details}
            ${button}
            ${m.note ? `<tr><td style="padding:16px 32px 0;font:13px/1.6 ${font};color:#86769c">${esc(m.note)}</td></tr>` : ""}
            ${m.button ? `<tr><td style="padding:10px 32px 0;font:12px/1.6 ${font};color:#a194b4;word-break:break-all">Button not working? Paste this link into your browser:<br><a href="${esc(m.button.url)}" style="color:#7a52c7">${esc(m.button.url)}</a></td></tr>` : ""}
            <tr><td style="height:30px;font-size:0;line-height:0">&nbsp;</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:20px 8px 0;font:12px/1.6 ${font};color:#8d7fa3;text-align:center">
          Here’s My Church is a community-built map that helps people find a church near them.<br>
          <a href="${esc(site)}" style="color:#7a52c7;text-decoration:none">heresmychurch.com</a>${m.stop ? ` · <a href="${esc(m.stop.url)}" style="color:#8d7fa3">${esc(m.stop.label)}</a>` : ""}
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
