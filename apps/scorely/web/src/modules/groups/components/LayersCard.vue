<script lang="ts">
import { type Game, GROUP_LIMITS, type Group, UpdateGroupInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import {
  changeLayer,
  type LayerKey,
  type Layers,
  layerOpensAt,
  layerTimeline,
  stepHours,
} from '@scorely/web/src/modules/groups/layers';
import { defineComponent, type PropType } from 'vue';

interface EditRow {
  key: LayerKey;
  name: string;
  hours: number;
  hint: string;
  off: boolean;
  /** Onde a barra começa na linha do tempo (0–100% de 144h antes até o jogo). */
  left: string;
}

const KEYS: LayerKey[] = ['members', 'reserves', 'guests'];
const GUESTS_DEFAULT = 6;

/** Linha "Abertura da lista" dos Ajustes (GRP-29): o resumo e, ao tocar, o editor das camadas no painel de baixo. */
export default defineComponent({
  name: 'LayersCard',

  components: { BottomSheet, HoursStepper, SettingsRow },

  props: {
    group: { type: Object as PropType<Group>, required: true },
    game: { type: Object as PropType<Game>, required: true },
    isOwner: { type: Boolean, default: false },
  },

  emits: ['saved'],

  data() {
    return {
      editing: false,
      saving: false,
      draft: { members: 48, reserves: 24, guests: null } as Layers,
    };
  },

  computed: {
    /** GRP-29: "Membros 07/11, 19:00 · Reservas 09/11, 19:00 · Convidados desligado", com as datas do jogo atual. */
    summary(): string {
      return layerTimeline(this.game, new Date())
        .map((step) => {
          const layer = this.$t(`groups.layerNames.${step.key}`);
          return step.at
            ? this.$t('groups.settings.summary.layer', { layer, when: formatDateTime(step.at) })
            : this.$t('groups.settings.summary.layerOff', { layer });
        })
        .join(' · ');
    },

    rows(): EditRow[] {
      return KEYS.map((key) => {
        const off = key === 'guests' && this.draft.guests === null;
        const hours = this.draft[key] ?? GUESTS_DEFAULT;
        const max = GROUP_LIMITS.listOpensHoursBefore.max;
        return {
          key,
          name: this.$t(`groups.layerNames.${key}`),
          hours,
          off,
          hint: off ? this.$t('groups.layerState.off') : this.opensHint(hours),
          left: `${(100 - (hours / max) * 100).toFixed(1)}%`,
        };
      });
    },

    gameLabel(): string {
      return this.$t('groups.timeline.game', {
        weekday: this.$t(`weekdaysShort.${this.group.weekday}`),
        time: this.group.time,
      });
    },
  },

  methods: {
    opensHint(hours: number): string {
      const at = layerOpensAt(this.group.weekday, this.group.time, hours);
      const opens = this.$t('groups.layerOpensAt', {
        weekday: this.$t(`weekdaysShort.${at.weekday}`),
        time: at.time,
      });
      return `${opens} · ${this.$t('groups.layerHoursBefore', { hours })}`;
    },

    open() {
      this.draft = {
        members: this.group.listOpensHoursBefore,
        reserves: this.group.reservesOpenHoursBefore,
        guests: this.group.guestsOpenHoursBefore ?? null,
      };
      this.editing = true;
    },

    step(key: LayerKey, dir: 1 | -1) {
      const min = key === 'members' ? GROUP_LIMITS.listOpensHoursBefore.min : 0;
      const current = this.draft[key] ?? GUESTS_DEFAULT;
      this.draft = changeLayer(
        this.draft,
        key,
        stepHours(current, dir, min, GROUP_LIMITS.listOpensHoursBefore.max),
      );
    },

    toggleGuests(on: boolean) {
      this.draft = changeLayer(this.draft, 'guests', on ? GUESTS_DEFAULT : null);
    },

    async save() {
      const parsed = UpdateGroupInputSchema.safeParse({
        listOpensHoursBefore: this.draft.members,
        reservesOpenHoursBefore: this.draft.reserves,
        guestsOpenHoursBefore: this.draft.guests,
      });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        await groupsApi.update(this.group.id, parsed.data);
        this.editing = false;
        this.$q.notify({ type: 'positive', message: this.$t('groups.layersSaved') });
        this.$emit('saved');
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow
      icon="schedule"
      :title="$t('groups.settings.layers')"
      :summary="summary"
      @open="isOwner && open()"
    />

    <BottomSheet v-model="editing" :title="$t('groups.layers')" :persistent="saving">
      <div class="sc-caption q-mt-xs">{{ $t('groups.layersHint') }}</div>

      <div class="timeline" aria-hidden="true">
        <div class="track">
          <div class="axis" />
          <div
            v-for="(r, i) in rows"
            :key="r.key"
            class="bar"
            :class="[`bar--${r.key}`, { 'bar--off': r.off }]"
            :style="{ left: r.left, top: `${i * 22 + 4}px` }"
          />
          <div class="game-line" />
        </div>
        <div class="ends sc-label">
          <span>{{ $t('groups.timeline.start') }}</span>
          <span class="game-label">{{ gameLabel }}</span>
        </div>
      </div>

      <div v-for="r in rows" :key="r.key" class="row" :class="{ 'row--off': r.off }">
        <div class="row-text">
          <span class="dot" :class="`bar--${r.key}`" />
          <div>
            <div class="sc-display row-name">{{ r.name }}</div>
            <div class="sc-caption">{{ r.hint }}</div>
          </div>
        </div>
        <HoursStepper
          :value="r.hours"
          unit="h"
          :disable="r.off"
          :dec-label="$t('groups.lessHours', { layer: r.name })"
          :inc-label="$t('groups.moreHours', { layer: r.name })"
          @step="step(r.key, $event)"
        />
      </div>
      <q-toggle
        :model-value="draft.guests !== null"
        color="primary"
        left-label
        class="toggle"
        :label="$t('groups.guestsEnabled')"
        @update:model-value="toggleGuests"
      />

      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="editing = false" />
        <q-btn color="primary" unelevated class="sc-btn-main" :label="$t('groups.save')" :loading="saving" @click="save" />
      </div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.timeline {
  margin-top: 18px;
  background: var(--sc-bg);
  border: 1px solid var(--sc-line);
  border-radius: 12px;
  padding: 14px 12px 10px;
}

.track {
  position: relative;
  height: 66px;
}

.axis {
  position: absolute;
  left: 0;
  right: 0;
  top: 30px;
  height: 2px;
  background: var(--sc-line);
}

.bar {
  position: absolute;
  right: 0;
  height: 10px;
  border-radius: 5px;
}

.bar--members {
  background: var(--sc-accent);
}

.bar--reserves {
  background: var(--q-secondary);
}

.bar--guests {
  background: var(--sc-text);
}

.bar--off {
  opacity: 0.15;
}

.game-line {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--sc-text);
}

.ends {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: var(--sc-muted);
  margin-top: 6px;
}

.game-label {
  color: var(--sc-text);
}

.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 0;
  border-bottom: 1px solid var(--sc-line);
}

.row--off {
  opacity: 0.4;
}

.row-text {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.row-name {
  font-size: 20px;
}

.toggle {
  justify-content: space-between;
  width: 100%;
  min-height: 44px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 14px;
}
</style>
