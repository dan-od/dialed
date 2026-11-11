import { createTransport, type Transporter } from 'nodemailer';
import type { Config } from '../config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Machine-readable payload for dev/test transports only (never logged by the request logger). */
  meta: { kind: 'verify_code'; code: string } | { kind: 'reset_link'; url: string };
}

export interface EmailTransport {
  send(msg: EmailMessage): Promise<void>;
}

/** EMAIL_TRANSPORT=console: prints the code/link to stdout for local development (refused in production). */
export class ConsoleTransport implements EmailTransport {
  async send(msg: EmailMessage) {
    const what = msg.meta.kind === 'verify_code' ? `code ${msg.meta.code}` : `link ${msg.meta.url}`;
    process.stdout.write(`[email:console] to=${msg.to} subject="${msg.subject}" ${what}\n`);
  }
}

/** Test transport: keeps messages in memory. */
export class MemoryTransport implements EmailTransport {
  readonly sent: EmailMessage[] = [];
  async send(msg: EmailMessage) {
    this.sent.push(msg);
  }
  lastTo(email: string) {
    return [...this.sent].reverse().find((m) => m.to === email);
  }
}

/** EMAIL_TRANSPORT=smtp: sends through SMTP_URL (e.g. Resend's SMTP relay). Only subject and text go out. */
export class SmtpTransport implements EmailTransport {
  private readonly mailer: Transporter;
  constructor(
    url: string,
    private readonly from: string,
  ) {
    this.mailer = createTransport(url);
  }
  async send(msg: EmailMessage) {
    await this.mailer.sendMail({
      from: this.from,
      to: msg.to,
      subject: msg.subject,
      text: msg.text,
    });
  }
}

export function createEmailTransport(config: Config): EmailTransport {
  if (config.EMAIL_TRANSPORT === 'console') return new ConsoleTransport();
  if (!config.SMTP_URL) throw new Error('EMAIL_TRANSPORT=smtp needs SMTP_URL');
  return new SmtpTransport(config.SMTP_URL, config.EMAIL_FROM);
}
