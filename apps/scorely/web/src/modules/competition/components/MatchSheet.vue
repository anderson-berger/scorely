<script lang="ts">
import type { CompetitionGameDetail, GamePerson, Match, MatchWinner } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { defaultMatchTeams } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/** Onde a pessoa está na partida. */
type Side = 'a' | 'b' | 'off';

/**
 * Registrar ou corrigir uma partida (CMP-20, 23): a lista do jogo (dentro, depois fila) e os avulsos, cada pessoa no
 * Time A, no Time B ou fora, e o resultado por último. A nova vem com os times da última partida (ou os publicados).
 */
export default defineComponent({
  name: 'MatchSheet',

  components: { BottomSheet },

  inject: permissionLostInject,

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    detail: { type: Object as PropType<CompetitionGameDetail>, required: true },
    /** A partida que está sendo corrigida; sem ela, uma nova. */
    match: { type: Object as PropType<Match | undefined>, default: undefined },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_d: CompetitionGameDetail) => true,
    reload: () => true,
  },

  data() {
    return {
      sides: {} as Record<string, Side>,
      winner: 0 as MatchWinner,
      saving: false,
    };
  },

  computed: {
    title(): string {
      return this.match
        ? this.$t('competition.matches.number', { n: this.match.number })
        : this.$t('competition.matches.add');
    },

    /** Quem pode jogar: a lista (dentro, depois fila) e os avulsos dos times. */
    people(): GamePerson[] {
      const listed = this.detail.people.filter((p) => p.inside !== undefined);
      return [
        ...listed.filter((p) => p.inside),
        ...listed.filter((p) => !p.inside),
        ...this.detail.people.filter((p) => p.kind === 'extra'),
      ];
    },

    sideOptions(): { label: string; value: Side }[] {
      return [
        { label: this.$t('competition.matches.sideA'), value: 'a' },
        { label: this.$t('competition.matches.sideB'), value: 'b' },
        { label: this.$t('competition.matches.off'), value: 'off' },
      ];
    },

    winnerOptions(): { label: string; value: MatchWinner }[] {
      return [
        { label: this.$t('competition.matches.winsA'), value: 0 },
        { label: this.$t('competition.matches.winsB'), value: 1 },
        { label: this.$t('competition.matches.draw'), value: 'draw' },
      ];
    },
  },

  watch: {
    modelValue: { immediate: true, handler: 'reset' },
  },

  methods: {
    reset(open: boolean) {
      if (!open) return;
      const [a, b] = this.match ? this.match.teams : defaultMatchTeams(this.detail);
      this.sides = Object.fromEntries(
        this.people.map((p) => [p.id, a.includes(p.id) ? 'a' : b.includes(p.id) ? 'b' : 'off']),
      );
      this.winner = this.match?.winner ?? 0;
    },

    close() {
      this.$emit('update:modelValue', false);
    },

    nameOf(p: GamePerson): string {
      return p.nickname;
    },

    setSide(id: string, side: Side) {
      this.sides = { ...this.sides, [id]: side };
    },

    async save() {
      const side = (s: Side) => this.people.filter((p) => this.sides[p.id] === s).map((p) => p.id);
      const input = { teams: [side('a'), side('b')] as [string[], string[]], winner: this.winner };
      this.saving = true;
      try {
        const saved = this.match
          ? await competitionApi.updateMatch(this.groupId, this.detail.id, this.match.id, {
              ...input,
              // CMP-42: a versão da partida que a tela mostra.
              version: this.match.version,
            })
          : await competitionApi.createMatch(this.groupId, this.detail.id, input);
        this.$q.notify({ type: 'positive', message: this.$t('competition.matches.saved') });
        this.$emit('saved', saved);
        this.close();
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) return this.close();
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        if (err instanceof ApiRequestError && err.code === 'COMPETITION_INACTIVE') {
          this.close();
          this.$emit('reload');
        }
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="title"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption q-mt-xs">{{ $t('competition.matches.hint') }}</div>
    <div v-for="p in people" :key="p.id" class="row">
      <div class="name">{{ nameOf(p) }}</div>
      <q-btn-toggle
        :model-value="sides[p.id]"
        no-caps
        unelevated
        dense
        toggle-color="primary"
        :disable="saving"
        :options="sideOptions"
        @update:model-value="setSide(p.id, $event)"
      />
    </div>

    <h3 class="sc-section sub">{{ $t('competition.matches.result') }}</h3>
    <q-option-group v-model="winner" :options="winnerOptions" type="radio" :disable="saving" />

    <div class="actions">
      <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="close" />
      <q-btn
        color="primary"
        unelevated
        class="sc-btn-main"
        :label="$t('groups.save')"
        :loading="saving"
        @click="save"
      />
    </div>
  </BottomSheet>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.name {
  min-width: 0;
  font-size: 15px;
}

.sub {
  margin: 18px 0 6px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}
</style>
