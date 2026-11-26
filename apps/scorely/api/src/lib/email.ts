import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from '@scorely/api/src/lib/env';
import { lazy } from '@scorely/api/src/lib/fn';

/** Email como chave: sem espaços nas pontas e em minúsculas (AUTH-01, USR-01). Quem monta a chave normaliza. */
export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Só no serverless offline: o último email de cada destinatário num arquivo, que o `/screens` lê (ADR 0023). */
async function writeToOutbox(message: EmailMessage) {
  const dir = join(tmpdir(), 'scorely-outbox');
  await mkdir(dir, { recursive: true });
  const content = JSON.stringify({ ...message, sentAt: new Date().toISOString() });
  await writeFile(join(dir, `${message.to.replaceAll('/', '_')}.json`), content);
}

/** Dev: loga, e o código de login aparece no terminal do serverless offline. */
export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`\n📧 [email] to ${to} — ${subject}\n${text}\n`);
    if (process.env.IS_OFFLINE === 'true') await writeToOutbox({ to, subject, text });
  },
};

export function sesMailer(from: string, region: string): Mailer {
  const client = new SESv2Client({ region });
  return {
    async send({ to, subject, text }) {
      await client.send(
        new SendEmailCommand({
          FromEmailAddress: from,
          Destination: { ToAddresses: [to] },
          Content: {
            Simple: {
              Subject: { Data: subject, Charset: 'UTF-8' },
              Body: { Text: { Data: text, Charset: 'UTF-8' } },
            },
          },
        }),
      );
    },
  };
}

const cachedMailer = lazy((): Mailer => {
  const { EMAIL_MODE, EMAIL_FROM, AWS_REGION } = env();
  return EMAIL_MODE === 'ses' && EMAIL_FROM ? sesMailer(EMAIL_FROM, AWS_REGION) : consoleMailer;
});

export function mailer(): Mailer {
  return cachedMailer();
}
