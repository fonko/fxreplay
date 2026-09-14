import nodemailer, { type Transporter } from "nodemailer";

let transport: Transporter | null = null;

// DreamHost SMTP (or any standard SMTP mailbox) — lazily created and reused
// across invocations within the same serverless function instance.
export function getEmailTransport() {
  if (!transport) {
    const port = Number(import.meta.env.SMTP_PORT ?? 587);
    transport = nodemailer.createTransport({
      host: import.meta.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: {
        user: import.meta.env.SMTP_USER,
        pass: import.meta.env.SMTP_PASS,
      },
    });
  }
  return transport;
}
