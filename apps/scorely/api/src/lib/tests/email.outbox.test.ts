import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, onTestFinished, vi } from 'vitest';

// Outbox de dev (ADR 0023; docs/modules/auth.md, "Limites conhecidos"): no serverless offline o código de login
// também fica num arquivo por destinatário na pasta temporária do sistema, para o `/screens` entrar sozinho.

const NOW = new Date('2026-11-25T12:00:00.000Z');
const MESSAGE = { to: 'screens@scorely.dev', subject: 'Your code', text: 'Code: 123456' };

/**
 * Pasta temporária do sistema isolada (`TMPDIR`) e módulo recarregado, porque o `env()` é cacheado.
 * `isOffline` é o valor de `IS_OFFLINE`; `undefined` é a variável ausente, como no deploy.
 */
async function setup(isOffline: string | undefined) {
  const root = mkdtempSync(join(tmpdir(), 'outbox-test-'));
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('TMPDIR', root);
  vi.stubEnv('IS_OFFLINE', isOffline);
  vi.stubEnv('TABLE_NAME', 'scorely-test');
  vi.stubEnv('UPLOADS_BUCKET', 'scorely-test-uploads');
  vi.stubEnv('AUTH_SECRET', 'x'.repeat(40));
  vi.stubEnv('EMAIL_MODE', 'console');
  onTestFinished(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    log.mockRestore();
    rmSync(root, { recursive: true, force: true });
  });
  vi.resetModules();
  const { consoleMailer } = await import('@scorely/api/src/lib/email');

  const outbox = join(root, 'scorely-outbox');
  const read = (email: string) => JSON.parse(readFileSync(join(outbox, `${email}.json`), 'utf8'));
  return { consoleMailer, root, outbox, read, log };
}

describe('consoleMailer: outbox de dev (ADR 0023)', () => {
  it('no offline, grava { to, subject, text, sentAt } em <tmpdir>/scorely-outbox/<email>.json', async () => {
    const t = await setup('true');

    await t.consoleMailer.send(MESSAGE);

    const saved = t.read(MESSAGE.to);
    expect(saved).toEqual({ ...MESSAGE, sentAt: expect.anything() });
    expect(new Date(saved.sentAt).getTime()).toBe(NOW.getTime());
  });

  it('no offline, o código continua aparecendo no terminal', async () => {
    const t = await setup('true');

    await t.consoleMailer.send(MESSAGE);

    expect(t.log.mock.calls.flat().join('\n')).toContain(MESSAGE.text);
  });

  it('um arquivo por destinatário: o email de um não apaga o do outro', async () => {
    const t = await setup('true');
    const other = { to: 'ana@x.com', subject: 'Your code', text: 'Code: 654321' };

    await t.consoleMailer.send(MESSAGE);
    await t.consoleMailer.send(other);

    expect(readdirSync(t.outbox).sort()).toEqual(['ana@x.com.json', 'screens@scorely.dev.json']);
    expect(t.read(MESSAGE.to).text).toBe(MESSAGE.text);
    expect(t.read(other.to).text).toBe(other.text);
  });

  it('um email novo para o mesmo destinatário substitui o anterior: o arquivo tem o último código', async () => {
    const t = await setup('true');
    const later = new Date(NOW.getTime() + 61_000);

    await t.consoleMailer.send(MESSAGE);
    vi.setSystemTime(later);
    await t.consoleMailer.send({ ...MESSAGE, text: 'Code: 999999' });

    expect(readdirSync(t.outbox)).toEqual([`${MESSAGE.to}.json`]);
    const saved = t.read(MESSAGE.to);
    expect(saved.text).toBe('Code: 999999');
    expect(new Date(saved.sentAt).getTime()).toBe(later.getTime());
  });

  it.each([undefined, '', 'false'])('fora do offline (IS_OFFLINE=%j), nada é gravado', async (value) => {
    const t = await setup(value);

    await t.consoleMailer.send(MESSAGE);

    expect(existsSync(t.outbox)).toBe(false);
    expect(readdirSync(t.root)).toEqual([]);
  });
});
