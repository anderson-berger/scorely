<script lang="ts">
import type { CompetitionGameDetail, Match } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { matchTally } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import MatchSheet from '@scorely/web/src/modules/competition/components/MatchSheet.vue';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * As partidas do jogo (CMP-22, 23): o vencedor do dia, "vitórias / partidas" por pessoa e as partidas numeradas. Quem
 * fecha (`canEdit`) registra, corrige e apaga; os outros veem só leitura.
 */
export default defineComponent({
  name: 'MatchesList',

  components: { MatchSheet },

  inject: permissionLostInject,

  props: {
    groupId: { type: String, required: true },
    detail: { type: Object as PropType<CompetitionGameDetail>, required: true },
    canEdit: { type: Boolean, default: false },
  },

  emits: {
    changed: (_d: CompetitionGameDetail) => true,
    reload: () => true,
  },

  data() {
    return {
      sheetOpen: false,
      editing: undefined as Match | undefined,
      busy: false,
    };
  },

  computed: {
    names(): Map<string, string> {
      return new Map(this.detail.people.map((p) => [p.id, p.nickname]));
    },

    dayWinner(): string {
      if (this.detail.dayWinners.length === 0) return this.$t('competition.matches.noDayWinner');
      return this.$t('competition.matches.dayWinner', {
        names: this.detail.dayWinners.map((id) => this.nameOf(id)).join(', '),
      });
    },

    tally(): { id: string; name: string; text: string }[] {
      return matchTally(this.detail.matches).map((t) => ({
        id: t.id,
        name: this.nameOf(t.id),
        text: this.$t('competition.matches.tally', { wins: t.wins, played: t.played }),
      }));
    },
  },

  methods: {
    nameOf(id: string): string {
      // USR-02: quem não está na lista aparece pelo código de amigo (o próprio id)
      return this.names.get(id) ?? id;
    },

    side(ids: string[]): string {
      return ids.map((id) => this.nameOf(id)).join(', ');
    },

    resultOf(m: Match): string {
      if (m.winner === 'draw') return this.$t('competition.matches.draw');
      return this.$t(m.winner === 0 ? 'competition.matches.winsA' : 'competition.matches.winsB');
    },

    add() {
      this.editing = undefined;
      this.sheetOpen = true;
    },

    fix(m: Match) {
      this.editing = m;
      this.sheetOpen = true;
    },

    ask(message: string): Promise<boolean> {
      return new Promise((resolve) => {
        this.$q
          .dialog({
            message,
            cancel: { label: this.$t('groups.no'), flat: true },
            ok: { label: this.$t('groups.yes'), color: 'primary' },
            persistent: true,
          })
          .onOk(() => resolve(true))
          .onCancel(() => resolve(false));
      });
    },

    /** CMP-23: apagar pede confirmação; as seguintes são renumeradas. */
    async remove(m: Match) {
      if (!(await this.ask(this.$t('competition.matches.removeConfirm', { n: m.number })))) return;
      this.busy = true;
      try {
        const saved = await competitionApi.deleteMatch(this.groupId, this.detail.date, m.id, {
          version: m.version,
        });
        this.$q.notify({ type: 'positive', message: this.$t('competition.matches.removed') });
        this.$emit('changed', saved);
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) return;
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        this.$emit('reload');
      } finally {
        this.busy = false;
      }
    },
  },
});
</script>

<template>
  <section>
    <h3 class="sc-section sub">{{ $t('competition.matches.title') }}</h3>
    <div class="sc-display winner">{{ dayWinner }}</div>
    <div v-if="tally.length > 0" class="tally">
      <span v-for="t in tally" :key="t.id" class="sc-caption chip">{{ t.name }} · {{ t.text }}</span>
    </div>

    <div v-if="detail.matches.length === 0" class="sc-caption empty">{{ $t('competition.matches.empty') }}</div>
    <div v-for="m in detail.matches" :key="m.id" class="match">
      <div class="match-main">
        <div class="sc-display number">{{ $t('competition.matches.number', { n: m.number }) }}</div>
        <div class="teams">
          <span :class="{ won: m.winner === 0 }">{{ side(m.teams[0]) }}</span>
          <span class="sc-caption">×</span>
          <span :class="{ won: m.winner === 1 }">{{ side(m.teams[1]) }}</span>
        </div>
        <div class="sc-caption">{{ resultOf(m) }}</div>
      </div>
      <div v-if="canEdit" class="match-actions">
        <q-btn flat dense round icon="edit" :aria-label="$t('competition.matches.fix')" :disable="busy" @click="fix(m)" />
        <q-btn
          flat
          dense
          round
          icon="delete"
          :aria-label="$t('competition.matches.remove')"
          :disable="busy"
          @click="remove(m)"
        />
      </div>
    </div>

    <q-btn
      v-if="canEdit"
      flat
      no-caps
      icon="add"
      class="sc-btn-outline add"
      :label="$t('competition.matches.add')"
      :disable="busy"
      @click="add"
    />

    <MatchSheet
      v-if="canEdit"
      v-model="sheetOpen"
      :group-id="groupId"
      :detail="detail"
      :match="editing"
      @saved="$emit('changed', $event)"
      @reload="$emit('reload')"
    />
  </section>
</template>

<style scoped>
.sub {
  margin: 14px 0 6px;
}

.winner {
  font-size: 17px;
  color: var(--sc-accent);
}

.tally {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.chip {
  padding: 2px 8px;
  border: 1px solid var(--sc-line);
  border-radius: 999px;
}

.empty {
  margin: 8px 0;
}

.match {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.match-main {
  min-width: 0;
}

.number {
  font-size: 15px;
}

.teams {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 14px;
}

.won {
  color: var(--sc-accent);
  font-weight: 600;
}

.match-actions {
  display: flex;
  flex-shrink: 0;
}

.add {
  margin-top: 10px;
}
</style>
