import { groupColor, initials } from '@scorely/web/src/modules/groups/group-display';

/** Um atalho de grupo na barra lateral (GRV-13): o logo, ou as iniciais na cor fixa (GRV-11), e se é o grupo aberto. */
export type RailGroup = {
  id: string;
  name: string;
  logoUrl: string | undefined;
  /** Cor fixa do id público (1–6), usada sem logo (GRV-11). */
  color: 1 | 2 | 3 | 4 | 5 | 6;
  /** Iniciais do nome, usadas sem logo (GRV-11). */
  initials: string;
  /** É o grupo aberto (destacado na barra). */
  active: boolean;
};

/** GRV-13: os atalhos na ordem de GRV-05, com o grupo aberto (`openId`, o id público da rota) destacado. */
export function groupRailItems(
  groups: { id: string; name: string; logoUrl?: string | undefined }[],
  openId: string | undefined,
): RailGroup[] {
  return groups.map((g) => ({
    id: g.id,
    name: g.name,
    logoUrl: g.logoUrl,
    color: groupColor(g.id),
    initials: initials(g.name),
    active: openId !== undefined && g.id === openId,
  }));
}
