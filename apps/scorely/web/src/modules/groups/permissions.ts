import type { Group, Permission } from '@scorely/contracts';
import { ApiRequestError } from '@scorely/web/src/lib/http';

/**
 * O que quem vê a página pode fazer (GRP-49, 55). Sai do `myPermissions` que a api devolve: o web não calcula
 * permissão, só mostra ou esconde (GRP-52). `owner` (o cargo Dono, `myRoleId`) é para o que é só do dono: arquivar,
 * cargos e passar o grupo.
 */
export interface GroupAccess {
  owner: boolean;
  game: boolean;
  teams: boolean;
  members: boolean;
  settings: boolean;
  /** `seasons.manage`: o regulamento da competição (CMP-07). */
  seasons: boolean;
  /** `results.record`: fechar os jogos na competição (CMP-11). */
  results: boolean;
}

export const NO_ACCESS: GroupAccess = {
  owner: false,
  game: false,
  teams: false,
  members: false,
  settings: false,
  seasons: false,
  results: false,
};

export function groupAccess(group: Pick<Group, 'myRoleId' | 'myPermissions'>): GroupAccess {
  const has = (p: Permission) => group.myPermissions.includes(p);
  return {
    owner: group.myRoleId === 'owner',
    game: has('game.manage'),
    teams: has('teams.manage'),
    members: has('members.manage'),
    settings: has('settings.edit'),
    seasons: has('seasons.manage'),
    results: has('results.record'),
  };
}

/**
 * A aba Ajustes (GRP-29, 37): com alguma linha que a pessoa pode mudar. No grupo arquivado, só o dono (desarquivar).
 */
export function showsSettings(access: GroupAccess, archived: boolean): boolean {
  if (archived) return access.owner;
  return access.settings || access.teams || access.game || access.seasons || access.owner;
}

/** GRP-57: o erro de uma ação barrada por permissão (a tela recarrega o grupo em vez de só avisar). */
export function isPermissionError(err: unknown): boolean {
  return (
    err instanceof ApiRequestError &&
    (err.code === 'GROUP_PERMISSION_DENIED' || err.code === 'GROUP_NOT_OWNER')
  );
}

/** ADR 0016: outra pessoa mudou o item antes (GRP-59, TIM-25, CMP-42). A tela relê, fecha o painel e avisa. */
export function isVersionConflict(err: unknown): boolean {
  return err instanceof ApiRequestError && err.code === 'VERSION_CONFLICT';
}

/** GRP-57: ao voltar para a aba, relê se a última leitura tem 1 min ou mais, e nunca com outra em andamento. */
export const REFRESH_AFTER_MS = 60_000;

export function shouldRefresh(lastLoadAt: number | undefined, now: number, loading: boolean): boolean {
  if (loading) return false;
  return lastLoadAt === undefined || now - lastLoadAt >= REFRESH_AFTER_MS;
}

/** Chave do `provide`/`inject` com que os componentes da página do grupo avisam que perderam a permissão (GRP-57). */
export const PERMISSION_LOST = 'groupPermissionLost';

/** O `inject` dos componentes da página do grupo (GRP-57). Fora da página, não faz nada. */
export const permissionLostInject = {
  permissionLost: { from: PERMISSION_LOST, default: () => async (_err?: unknown) => undefined },
};

/**
 * GRP-57: no `catch` de uma ação. Se o erro é de permissão ou de versão (ADR 0016: outra pessoa mudou antes), avisa
 * o casco (que mostra a mensagem e recarrega) e devolve `true`: o componente só fecha o painel. Senão, `false`: o
 * componente trata o erro como sempre.
 */
export async function onPermissionError(err: unknown, permissionLost: unknown): Promise<boolean> {
  if (!isPermissionError(err) && !isVersionConflict(err)) return false;
  if (typeof permissionLost === 'function') await (permissionLost as (err: unknown) => Promise<void>)(err);
  return true;
}
