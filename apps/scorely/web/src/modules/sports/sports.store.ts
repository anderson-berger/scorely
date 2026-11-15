import type { Sport } from '@scorely/contracts';
import { i18n } from '@scorely/web/src/i18n';
import { localized, positionName as nameOf } from '@scorely/web/src/modules/sports/catalog';
import { sportsApi } from '@scorely/web/src/modules/sports/sports.api';
import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

/** ESP-08: o catálogo de esportes, baixado uma vez por sessão. */
export const useSportsStore = defineStore('sports', () => {
  const sports = ref<Sport[]>([]);
  /** O pedido do catálogo: um só por sessão, inclusive com dois `load` ao mesmo tempo. */
  const state: { loading?: Promise<void> | undefined } = {};

  function load(): Promise<void> {
    state.loading ??= sportsApi.catalog().then(
      (catalog) => {
        sports.value = catalog.sports;
      },
      (err: unknown) => {
        // Falhou: o próximo `load` tenta de novo.
        state.loading = undefined;
        throw err;
      },
    );
    return state.loading;
  }

  const byId = (id: string): Sport | undefined => sports.value.find((s) => s.id === id);
  /** Os que aparecem para escolher ao criar o grupo (ESP-05). */
  const active = computed(() => sports.value.filter((s) => s.active));

  /** ESP-08: o nome no idioma atual; antes de o catálogo chegar (ou fora dele), o próprio id. */
  const sportName = (id: string): string => {
    const sport = byId(id);
    return sport ? localized(sport.name, i18n.global.locale.value) : id;
  };
  const positionName = (sportId: string, positionId: string): string =>
    nameOf(byId(sportId), positionId, i18n.global.locale.value);

  return { sports, load, byId, active, sportName, positionName };
});
