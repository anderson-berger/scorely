import { Dialog } from 'quasar';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Rótulo da ação (ex.: "Cancelar partida"). */
  ok: string;
  /** Rótulo de quem desiste (ex.: "Manter"). */
  cancel: string;
  /** Ação de perigo (apagar, sair, cancelar): o ok fica vermelho. */
  danger?: boolean;
}

/**
 * Confirmação de sim/não (`web-visual.md`, "Confirmação"): sempre centralizada, os dois botões de texto,
 * o ok vermelho quando é perigo. `true` no ok; `false` no cancelar, no Esc ou no clique fora.
 */
export function confirmAction(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    Dialog.create({
      title: options.title,
      ...(options.message === undefined ? {} : { message: options.message }),
      cancel: { label: options.cancel, flat: true },
      ok: { label: options.ok, flat: true, ...(options.danger ? { color: 'negative' } : {}) },
    })
      .onOk(() => resolve(true))
      .onCancel(() => resolve(false));
  });
}
