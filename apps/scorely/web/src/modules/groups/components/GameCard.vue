<script lang="ts">
import type { Attendee, Game, PlayerPosition } from '@scorely/contracts';
import { defineComponent, type PropType } from 'vue';
import { formatDateTime } from '@/lib/datetime';
import PlayerPositions from '../../teams/components/PlayerPositions.vue';
import { nextLayer } from '../layers';
import { type ListGate, listGate } from '../links';
import {
  countdown,
  formatCountdown,
  initials,
  type LineupSlot,
  lineupSlots,
  type Score,
  score,
} from '../scoreboard';
import LayersTimeline from './LayersTimeline.vue';

/** Intervalo da contagem regressiva (plano 008, D9). */
const TICK_MS = 30_000;

/**
 * O jogo atual (planos 007 D8, 008, 012 D5 e 015 D5–D8, D14–D16): título com a data, placar sempre visível,
 * uma área de ação por estado, a abertura da lista e a Escalação como vagas (e o Banco, com fila).
 * A partir de 1024px, duas colunas; com o jogo cancelado, só a faixa.
 */
export default defineComponent({
  name: 'GameCard',

  components: { LayersTimeline, PlayerPositions },

  props: {
    game: { type: Object as PropType<Game>, required: true },
    busy: { type: Boolean, default: false },
    /** TIM-05: posições de cada pessoa (ausente = o esporte não tem posições). */
    playerPositions: {
      type: Object as PropType<Record<string, PlayerPosition[]> | undefined>,
      default: undefined,
    },
    canEditPositions: { type: Boolean, default: false },
  },

  emits: { confirm: () => true, leave: () => true, editPlayer: (_userId: string) => true },

  data() {
    return {
      now: new Date(),
      timer: undefined as ReturnType<typeof setInterval> | undefined,
    };
  },

  computed: {
    gate(): ListGate {
      return listGate(this.game, this.now);
    },

    score(): Score {
      return score(this.game);
    },

    /** "Sexta-feira, 13/11 · 19:00" (D5). */
    title(): string {
      const at = this.game.startsAt;
      const weekday = formatDateTime(at, 'weekday');
      const day = `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)}, ${formatDateTime(at, 'dayMonth')}`;
      return `${day} · ${formatDateTime(at, 'time')}`;
    },

    legend(): string {
      const base = this.$t('groups.scoreLegend');
      return this.score.waiting > 0
        ? `${base}${this.$t('groups.waitingSuffix', { count: this.score.waiting })}`
        : base;
    },

    cancelled(): boolean {
      return this.game.status === 'cancelled';
    },

    /** "1d 22h 45min" enquanto a minha camada não abre (D7/D8). */
    left(): string {
      return this.gate.kind === 'opens_at' ? formatCountdown(countdown(this.now, this.gate.at)) : '';
    },

    opensAt(): string {
      return this.gate.kind === 'opens_at' ? formatDateTime(this.gate.at) : '';
    },

    /** Embaixo do "Confirmar": vagas que sobram (ou a posição na fila) e a próxima camada (D7, plano 012 D5). */
    confirmHint(): string {
      const spots = this.score.full
        ? this.$t('groups.wouldBeWaiting', { position: this.score.waiting + 1 })
        : this.$t(
            'groups.spotsLeft',
            { count: this.score.slots - this.score.confirmed },
            this.score.slots - this.score.confirmed,
          );
      const next = nextLayer(this.game, this.now);
      if (!next) return spots;
      const layer =
        next.kind === 'all_open'
          ? this.$t('groups.nextLayer.allOpen')
          : this.$t(`groups.nextLayer.${next.kind}`, { date: formatDateTime(next.at) });
      return `${spots} · ${layer}`;
    },

    /** Vagas preenchidas e livres (D14). */
    slots(): { rows: LineupSlot<Attendee>[]; hiddenFree: number } {
      return lineupSlots(this.game.confirmed, this.game.slots);
    },

    lineupTitle(): string {
      return this.$t('groups.lineupCount', { count: `${this.game.confirmed.length}/${this.game.slots}` });
    },

    /** Posição de quem vê na Escalação (0-based), para destacar a linha. */
    myIndex(): number {
      return this.game.me?.list === 'confirmed' ? this.game.me.position - 1 : -1;
    },
  },

  mounted() {
    this.timer = setInterval(() => {
      this.now = new Date();
    }, TICK_MS);
  },

  beforeUnmount() {
    clearInterval(this.timer);
  },

  methods: {
    /** TIM-05: tocar na pessoa (ou nas posições dela) abre o painel de posições (só o dono, com o grupo ativo). */
    edit(userId: string) {
      if (this.canEditPositions) this.$emit('editPlayer', userId);
    },

    personName(p: Pick<Attendee, 'name'>): string {
      return p.name ?? this.$t('groups.unnamed');
    },

    initials(p: Pick<Attendee, 'name'>): string {
      return initials(this.personName(p));
    },
  },
});
</script>

<template>
  <section class="game" :class="{ 'game--split': !cancelled }">
    <div class="main">
      <h2 class="sc-display when">{{ title }}</h2>

      <div v-if="cancelled" class="banner banner--danger">
        <div class="sc-display banner-title">{{ $t('gameStatus.cancelled') }}</div>
        <div class="banner-text">{{ $t('groups.cancelledHint') }}</div>
      </div>

      <div v-else class="sc-card block">
        <div class="board">
          <div class="sc-number count">
            <span :class="{ 'sc-accent': score.confirmed > 0 }">{{ score.confirmed }}</span
            ><span class="colon">:</span>{{ score.slots }}
          </div>
          <div class="legend">{{ legend }}</div>
        </div>

        <div class="action">
          <template v-if="gate.kind === 'opens_at' && !game.me">
            <div class="sc-label opens-label">{{ $t('groups.opensIn') }}</div>
            <div class="sc-display opens-left sc-accent">{{ left }}</div>
            <div class="hint">{{ $t('groups.confirmFrom', { date: opensAt }) }}</div>
          </template>

          <div v-else-if="game.me" class="me">
            <div>
              <div class="sc-display me-title sc-accent">
                {{
                  game.me.list === 'confirmed'
                    ? $t('groups.youPlayAt', { position: game.me.position })
                    : $t('groups.youWaitAt', { position: game.me.position })
                }}
              </div>
            </div>
            <q-btn
              v-if="gate.kind === 'can_change'"
              flat
              no-caps
              class="sc-btn-outline"
              :label="$t('groups.leave')"
              :loading="busy"
              @click="$emit('leave')"
            />
          </div>

          <template v-else-if="gate.kind === 'can_change'">
            <q-btn
              color="primary"
              unelevated
              class="full-width sc-btn-main"
              :label="score.full ? $t('groups.joinWaitlist') : $t('groups.confirm')"
              :loading="busy"
              @click="$emit('confirm')"
            />
            <div class="hint">{{ confirmHint }}</div>
          </template>

          <div v-else-if="game.status === 'in_progress'" class="hint">{{ $t('groups.inProgressHint') }}</div>
        </div>
      </div>

      <LayersTimeline v-if="!cancelled" class="timeline" :game="game" :now="now" />
    </div>

    <div v-if="!cancelled" class="lists">
      <!-- TIM-14: o card Times entra antes da Escalação. -->
      <slot name="teams" />
      <h2 class="sc-section">{{ lineupTitle }}</h2>
      <div class="sc-card list">
        <template v-for="row in slots.rows" :key="row.position">
          <div
            v-if="row.person"
            class="sc-row person"
            :class="{ 'person--me': row.position - 1 === myIndex, 'person--editable': canEditPositions }"
            @click="edit(row.person.userId)"
          >
            <span class="sc-number pos">{{ row.position }}</span>
            <span class="avatar">{{ initials(row.person) }}</span>
            <span class="who">
              <span class="pname">{{ personName(row.person) }}</span>
              <PlayerPositions
                v-if="playerPositions"
                :positions="playerPositions[row.person.userId]"
                :editable="canEditPositions"
                :name="personName(row.person)"
                @edit="edit(row.person.userId)"
              />
            </span>
            <span v-if="row.person.role !== 'member'" class="sc-label role">{{
              $t(`groups.roles.${row.person.role}`)
            }}</span>
          </div>
          <div v-else class="sc-row person person--free">
            <span class="sc-number pos">{{ row.position }}</span>
            <span class="avatar avatar--ghost" aria-hidden="true" />
            <span class="pname sc-muted">{{ $t('groups.freeSlot') }}</span>
          </div>
        </template>
        <div v-if="slots.hiddenFree > 0" class="sc-caption more">
          {{ $t('groups.moreFreeSlots', { count: slots.hiddenFree }, slots.hiddenFree) }}
        </div>
      </div>

      <template v-if="game.waitlist.length > 0">
        <h2 class="sc-section bench-title">{{ $t('groups.benchCount', { count: game.waitlist.length }) }}</h2>
        <div class="sc-card sc-card--dashed list">
          <div
            v-for="(a, i) in game.waitlist"
            :key="a.userId"
            class="person"
            :class="{ 'person--editable': canEditPositions }"
            @click="edit(a.userId)"
          >
            <span class="sc-number pos">{{ i + 1 }}</span>
            <span class="avatar avatar--ghost">{{ initials(a) }}</span>
            <span class="who">
              <span class="pname sc-muted">{{ personName(a) }}</span>
              <PlayerPositions
                v-if="playerPositions"
                :positions="playerPositions[a.userId]"
                :editable="canEditPositions"
                :name="personName(a)"
                @edit="edit(a.userId)"
              />
            </span>
            <span v-if="a.role !== 'member'" class="sc-label role">{{ $t(`groups.roles.${a.role}`) }}</span>
          </div>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.person--editable {
  cursor: pointer;
}

.game {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.when {
  margin: 0 0 10px;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--sc-text-2);
}

.banner {
  border-radius: 16px;
  padding: 24px 16px;
  text-align: center;
}

.banner--danger {
  background: var(--sc-danger-soft);
  border: 1px solid var(--sc-danger-line);
}

.banner-title {
  font-size: 30px;
  color: var(--sc-danger);
}

.banner-text {
  font-size: 14px;
  color: var(--sc-text-2);
  margin-top: 8px;
  line-height: 1.45;
}

.block {
  overflow: hidden;
}

.board {
  padding: 20px 16px 16px;
  text-align: center;
}

.count {
  font-size: 84px;
  line-height: 0.9;
  white-space: nowrap;
}

.colon {
  color: var(--sc-dim);
}

.legend {
  margin-top: 6px;
  font-size: 11px;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--sc-muted);
}

.action {
  border-top: 1px solid var(--sc-line);
  padding: 16px;
  text-align: center;
}

.action:empty {
  display: none;
}

.opens-label {
  font-size: 12px;
  color: var(--sc-muted);
}

.opens-left {
  font-size: 34px;
  font-weight: 800;
  margin-top: 4px;
}

.hint {
  font-size: 13px;
  color: var(--sc-text-2);
  margin-top: 10px;
  line-height: 1.45;
}

.me {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  text-align: left;
}

.me-title {
  font-size: 24px;
  line-height: 1.05;
}

.timeline {
  margin-top: 24px;
}

.timeline :deep(.sc-section),
.lists .sc-section {
  margin-bottom: 10px;
}

.bench-title {
  margin-top: 20px;
}

.list {
  overflow: hidden;
}

.person {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 46px;
  padding: 0 14px;
}

.person--me {
  background: var(--sc-accent-soft);
  box-shadow: inset 3px 0 0 var(--sc-accent);
}

.person--me .pos {
  color: var(--sc-accent);
}

.pos {
  width: 26px;
  font-size: 20px;
  color: var(--sc-dim);
  font-weight: 700;
}

.avatar {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: var(--sc-line);
  color: var(--sc-text-2);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.avatar--ghost {
  background: transparent;
  border: 1px dashed var(--sc-line-strong);
}

.person--free .pos {
  color: var(--sc-line-strong);
}

.more {
  padding: 12px 14px;
  grid-column: 1 / -1;
}

.who {
  flex-grow: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 0;
}

.pname {
  min-width: 0;
  font-size: 15px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.role {
  font-size: 11px;
  color: var(--sc-muted);
}

/* Desktop: duas colunas, com o bloco e a abertura à esquerda e a Escalação à direita (plano 015, D16);
   cancelado, uma coluna à esquerda com até 640px (plano 016, D4). */
@media (min-width: 1024px) {
  .game {
    max-width: 640px;
  }

  .game--split {
    max-width: none;
    display: grid;
    grid-template-columns: minmax(0, 5fr) minmax(0, 7fr);
    align-items: start;
  }

  .game--split .list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  }

  .count {
    font-size: 96px;
  }
}
</style>
