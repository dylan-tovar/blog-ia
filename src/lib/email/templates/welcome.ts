export type WelcomeEmailProps = {
  displayName: string;
};

export type EmailTemplate = {
  subject: string;
  html: string;
};

// Plain HTML on purpose (no Markdown involved): this is static, non-dynamic
// content, unlike the new-article email.
export function welcomeEmail({ displayName }: WelcomeEmailProps): EmailTemplate {
  return {
    subject: `¡Bienvenido/a, ${displayName}!`,
    html: `
      <div style="font-family: sans-serif; max-width: 560px; margin: 0 auto; color: #1a1a1a;">
        <h1 style="font-size: 20px;">¡Hola, ${displayName}!</h1>
        <p>Tu cuenta ya está lista. Gracias por sumarte.</p>
        <p>A partir de ahora podés seguir a los autores que te interesen y vas a recibir sus artículos nuevos directo en tu correo (podés desactivar esto cuando quieras).</p>
        <p>Nos vemos por acá.</p>
      </div>
    `.trim(),
  };
}
