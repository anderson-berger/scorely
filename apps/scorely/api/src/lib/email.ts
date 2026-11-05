import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { env } from './env';
import { lazy } from './fn';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Dev: só loga. O código de login aparece no terminal do serverless offline. */
export const consoleMailer: Mailer = {
  async send({ to, subject, text }) {
    console.log(`\n📧 [email] to ${to} — ${subject}\n${text}\n`);
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
