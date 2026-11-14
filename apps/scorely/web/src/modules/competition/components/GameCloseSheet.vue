<script lang="ts">
import type { AttendanceMark, CompetitionGameDetail, GamePerson, GameResultWinner } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { ApiRequestError } from '@scorely/web/src/lib/http';
import { draftAttendance } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent } from 'vue';

/** O vencedor no rascunho: o índice do time, `draw` ou `none` (sem resultado). */
type WinnerChoice = number | 'draw' | 'none';

/**
 * O painel de fechar o jogo (CMP-12, 13, 15, 17), o mesmo nas abas Jogo e Competição: a chamada (veio / faltou), o
 * vencedor do dia entre os times publicados (ou empate), o amistoso e Salvar. Jogo cancelado: só "Fechar como
 * cancelado". Abre buscando o jogo, com a chamada do fechamento ou a sugerida.
 */
export default defineComponent({
  name: 'GameCloseSheet',

  components: { BottomSheet },

  inject: permissionLostInject,

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    date: { type: String, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_d: CompetitionGameDetail) => true,
    /** A competição mudou por fora (venceu): quem usa relê. */
    reload: () => true,
  },

  data() {
    return {
      detail: undefined as CompetitionGameDetail | undefined,
      attendance: {} as Record<string, AttendanceMark>,
      winner: 'none' as WinnerChoice,
      friendly: false,
      loading: false,
      saving: false,
    };
  },

  computed: {
    title(): string {
      return this.detail
        ? this.$t('competition.closing.title', { date: formatDateTime(this.detail.startsAt, 'date') })
        : this.$t('competition.closing.titleShort');
    },

    /** A chamada: só quem está na lista (dentro e depois fila); os avulsos não entram (CMP-12). */
    listed(): GamePerson[] {
      const people = this.detail?.people.filter((p) => p.inside !== undefined) ?? [];
      return [...people.filter((p) => p.inside), ...people.filter((p) => !p.inside)];
    },

    winnerOptions(): { label: string; value: WinnerChoice }[] {
      const teams = this.detail?.teams ?? [];
      return [
        ...teams.map((_t, i) => ({
          label: this.$t('teams.teamName', { n: i + 1 }),
          value: i as WinnerChoice,
        })),
        { label: this.$t('competition.closing.draw'), value: 'draw' as WinnerChoice },
        { label: this.$t('competition.closing.noResult'), value: 'none' as WinnerChoice },
      ];
    },
  },

  watch: {
    modelValue: { immediate: true, handler: 'onOpen' },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },

    async onOpen(open: boolean) {
      if (!open) return;
      this.loading = true;
      this.detail = undefined;
      try {
        const detail = await competitionApi.game(this.groupId, this.date);
        this.detail = detail;
        this.attendance = draftAttendance(detail);
        this.winner = detail.winner ?? 'none';
        this.friendly = detail.friendly;
      } catch (err) {
        await this.fail(err);
      } finally {
        this.loading = false;
      }
    },

    nameOf(p: GamePerson): string {
      return p.nickname;
    },

    kindLabel(p: GamePerson): string {
      return p.kind === 'member' ? '' : this.$t(`competition.games.kind.${p.kind}`);
    },

    mark(id: string, value: AttendanceMark) {
      this.attendance = { ...this.attendance, [id]: value };
    },

    /** GRP-57 e CMP-10: permissão → fecha e a página recarrega; competição vencida → fecha e relê. */
    async fail(err: unknown) {
      if (await onPermissionError(err, this.permissionLost)) return this.close();
      this.$q.notify({ type: 'negative', message: errorMessage(err) });
      if (err instanceof ApiRequestError && err.code === 'COMPETITION_INACTIVE') {
        this.close();
        this.$emit('reload');
      }
    },

    async save() {
      if (!this.detail) return;
      const cancelled = this.detail.cancelled;
      const winner: GameResultWinner | undefined =
        cancelled || this.winner === 'none' || this.detail.unit === 'match' ? undefined : this.winner;
      this.saving = true;
      try {
        const saved = await competitionApi.closeGame(this.groupId, this.date, {
          attendance: cancelled ? {} : this.attendance,
          ...(winner !== undefined && { winner }),
          friendly: this.friendly,
        });
        this.$q.notify({ type: 'positive', message: this.$t('competition.closing.saved') });
        this.$emit('saved', saved);
        this.close();
      } catch (err) {
        await this.fail(err);
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
    <div v-if="loading || !detail" class="state"><q-spinner color="primary" size="md" /></div>

    <template v-else-if="detail.cancelled">
      <div class="sc-caption q-mt-xs">{{ $t('competition.closing.cancelledHint') }}</div>
      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="close" />
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t('competition.closing.closeCancelled')"
          :loading="saving"
          @click="save"
        />
      </div>
    </template>

    <template v-else>
      <h3 class="sc-section sub">{{ $t('competition.closing.attendance') }}</h3>
      <div class="sc-caption">{{ $t('competition.closing.attendanceHint') }}</div>
      <div v-for="p in listed" :key="p.id" class="row">
        <div class="who">
          <div class="name">{{ nameOf(p) }}</div>
          <div class="sc-caption">
            {{ p.inside ? $t('competition.closing.inside') : $t('competition.closing.queue') }}
            <template v-if="kindLabel(p)"> · {{ kindLabel(p) }}</template>
          </div>
        </div>
        <q-btn-toggle
          :model-value="attendance[p.id]"
          no-caps
          unelevated
          toggle-color="primary"
          :disable="saving"
          :options="[
            { label: $t('competition.games.person.present'), value: 'present' },
            { label: $t('competition.games.person.absent'), value: 'absent' },
          ]"
          @update:model-value="mark(p.id, $event)"
        />
      </div>

      <template v-if="detail.unit === 'day'">
        <h3 class="sc-section sub">{{ $t('competition.closing.winner') }}</h3>
        <div v-if="detail.teams.length === 0" class="sc-caption">{{ $t('competition.closing.noTeams') }}</div>
        <q-option-group v-else v-model="winner" :options="winnerOptions" type="radio" :disable="saving" />
      </template>
      <div v-else class="sc-caption q-mt-md">{{ $t('competition.closing.matchUnit') }}</div>

      <q-toggle v-model="friendly" class="q-mt-md" :label="$t('competition.closing.friendly')" :disable="saving" />

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
    </template>
  </BottomSheet>
</template>

<style scoped>
.state {
  padding: 24px 0;
  text-align: center;
}

.sub {
  margin: 18px 0 6px;
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.who {
  min-width: 0;
}

.name {
  font-size: 15px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}
</style>
