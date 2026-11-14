import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../../env';
import { log } from '../../log';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let smtp: Transporter | undefined;

const RESERVED_DOMAIN = /\.(test|example|invalid|localhost)$/i;

/**
 * Sends one message. In development and tests messages are written to the
 * outbox directory as JSON instead of being delivered, so flows that depend on
 * an emailed link can be completed without a mail server.
 */
export async function sendEmail(message: EmailMessage): Promise<void> {
  if (env.emailTransport === 'smtp') {
    // Reserved test domains (RFC 2606/6761) can never receive mail; the demo
    // accounts use them. Don't hand undeliverable mail to a real server.
    if (RESERVED_DOMAIN.test(message.to)) {
      log.info({ subject: message.subject }, 'email to a reserved test domain not sent');
      return;
    }
    smtp ??= nodemailer.createTransport(env.SMTP_URL!);
    await smtp.sendMail({ from: env.EMAIL_FROM, ...message });
    log.info({ subject: message.subject }, 'email sent');
    return;
  }
  await mkdir(env.OUTBOX_DIR, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  await writeFile(
    path.join(env.OUTBOX_DIR, name),
    JSON.stringify({ ...message, from: env.EMAIL_FROM, sentAt: new Date().toISOString() }, null, 2),
  );
  log.info({ subject: message.subject, file: name }, 'email written to outbox');
}
