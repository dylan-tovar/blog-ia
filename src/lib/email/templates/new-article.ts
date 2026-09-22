import type { EmailTemplate } from "./welcome";

export type NewArticleEmailProps = {
  authorName: string;
  title: string;
  bodyHtml: string;
  postUrl: string;
  unsubscribeUrl: string;
};

export function newArticleEmail({
  authorName,
  title,
  bodyHtml,
  postUrl,
  unsubscribeUrl,
}: NewArticleEmailProps): EmailTemplate {
  return {
    subject: `${authorName} publicó: ${title}`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <p style="color: #666; font-size: 14px;">${authorName} publicó un artículo nuevo</p>
        <h1 style="font-size: 22px;">${title}</h1>
        <div style="font-size: 16px; line-height: 1.6;">${bodyHtml}</div>
        <p><a href="${postUrl}">Ver en el sitio</a></p>
        <hr style="margin: 32px 0; border: none; border-top: 1px solid #e5e5e5;" />
        <p style="color: #999; font-size: 12px;">
          Recibiste este correo porque seguís a ${authorName}.
          <a href="${unsubscribeUrl}">Dejar de recibir este correo</a>.
        </p>
      </div>
    `.trim(),
  };
}
