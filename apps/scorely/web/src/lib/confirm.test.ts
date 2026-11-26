import { confirmAction } from '@scorely/web/src/lib/confirm';
import { Dialog } from 'quasar';
import { afterEach, describe, expect, it, vi } from 'vitest';

// web-visual.md, "Confirmação": o mesmo par de botões em toda confirmação; o ok fica vermelho só no perigo.

type Handlers = { ok?: () => void; cancel?: () => void };

vi.mock('quasar', () => ({ Dialog: { create: vi.fn() } }));

/** O `Dialog.create` falso: guarda as opções e os callbacks para o teste disparar. */
function fakeDialog(): { options: () => unknown; handlers: Handlers } {
  const handlers: Handlers = {};
  const chain = {
    onOk: (fn: () => void) => {
      handlers.ok = fn;
      return chain;
    },
    onCancel: (fn: () => void) => {
      handlers.cancel = fn;
      return chain;
    },
  };
  vi.mocked(Dialog.create).mockReturnValue(chain as unknown as ReturnType<typeof Dialog.create>);
  return { options: () => vi.mocked(Dialog.create).mock.calls[0]?.[0], handlers };
}

afterEach(() => {
  vi.mocked(Dialog.create).mockReset();
});

describe('confirmAction', () => {
  it('perigo: cancelar de texto e ok de texto vermelho, com título e mensagem', () => {
    const d = fakeDialog();
    void confirmAction({
      title: 'Cancelar partida?',
      message: 'Todos são avisados.',
      ok: 'Cancelar partida',
      cancel: 'Manter',
      danger: true,
    });
    expect(d.options()).toEqual({
      title: 'Cancelar partida?',
      message: 'Todos são avisados.',
      cancel: { label: 'Manter', flat: true },
      ok: { label: 'Cancelar partida', flat: true, color: 'negative' },
    });
  });

  it('sem perigo e sem mensagem: ok de texto sem cor e sem `message`', () => {
    const d = fakeDialog();
    void confirmAction({ title: 'Iniciar agora?', ok: 'Iniciar', cancel: 'Manter' });
    expect(d.options()).toEqual({
      title: 'Iniciar agora?',
      cancel: { label: 'Manter', flat: true },
      ok: { label: 'Iniciar', flat: true },
    });
  });

  it('ok → true', async () => {
    const d = fakeDialog();
    const answer = confirmAction({ title: 't', ok: 'ok', cancel: 'c' });
    d.handlers.ok?.();
    await expect(answer).resolves.toBe(true);
  });

  it('cancelar, Esc ou clique fora (onCancel) → false', async () => {
    const d = fakeDialog();
    const answer = confirmAction({ title: 't', ok: 'ok', cancel: 'c' });
    d.handlers.cancel?.();
    await expect(answer).resolves.toBe(false);
  });
});
