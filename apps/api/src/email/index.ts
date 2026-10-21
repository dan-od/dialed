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
