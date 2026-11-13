import type { Group } from '@scorely/contracts';
import type { Text } from '@scorely/web/src/modules/teams/rules';

/** Resumo da linha "Vagas e mínimo" dos Ajustes (GRP-29): "14 vagas · sem mínimo" ou "14 vagas · mínimo 10". */
export function capacitySummary(group: Pick<Group, 'slots' | 'minPlayers'>): Text[] {
  return [
    { key: 'groups.settings.summary.slots', params: { count: group.slots } },
    group.minPlayers === undefined
      ? { key: 'groups.settings.summary.noMin' }
      : { key: 'groups.settings.summary.min', params: { count: group.minPlayers } },
  ];
}

/** Resumo da linha "Limites" dos Ajustes (GRP-29): "30 membros · 30 reservas". */
export function limitsSummary(group: Pick<Group, 'maxMembers' | 'maxReserves'>): Text[] {
  return [
    { key: 'groups.settings.summary.members', params: { count: group.maxMembers } },
    {
      key:
        group.maxReserves === 1 ? 'groups.settings.summary.oneReserve' : 'groups.settings.summary.reserves',
      params: { count: group.maxReserves },
    },
  ];
}
