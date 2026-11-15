<script lang="ts">
import type { Group, Season } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime, localDateIn } from '@scorely/web/src/lib/datetime';
import {
  currentSeason,
  defaultSeasonDates,
  seasonStatusText,
  seasonTitle,
  type Text,
} from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * A linha Temporadas dos Ajustes (CMP-35): o resumo da temporada de agora e o painel para abrir ou programar uma nova
 * (nome, início e fim), editar ou cancelar a programada e encerrar a aberta (com confirmação).
 */
export default defineComponent({
  name: 'SeasonSettingsRow',

  components: { BottomSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  data() {
    return {
      seasons: [] as Season[],
      open: false,
      /** O form: uma nova (sem `editing`) ou a programada que está sendo editada. */
      formOpen: false,
      editing: undefined as Season | undefined,
      form: { name: '', startDate: '', endDate: '', copyRules: false },
      saving: false,
    };
  },

  computed: {
    today(): string {
      return localDateIn(this.group.timeZone);
    },

    current(): Season | undefined {
      return currentSeason(this.seasons);
    },

    scheduled(): Season | undefined {
      return this.seasons.find((s) => s.state === 'scheduled');
    },

    summary(): string {
      const s = this.current ?? this.scheduled;
      return s ? `${this.title(s)} · ${this.status(s)}` : this.$t('competition.seasons.none');
    },
  },

  watch: {
    'group.id': { immediate: true, handler: 'load' },
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    title(s: Season): string {
      return this.text(seasonTitle(s));
    },

    status(s: Season): string {
      const date = (local: string) => formatDateTime(`${local}T12:00:00.000Z`, 'date', { timeZone: 'UTC' });
      return this.text(seasonStatusText(s, this.today, date, (iso) => formatDateTime(iso)));
    },

    async load() {
      try {
        this.seasons = await competitionApi.seasons(this.group.id);
      } catch {
        this.seasons = [];
      }
    },

    newSeason() {
      this.editing = undefined;
      this.form = { name: '', ...defaultSeasonDates(this.today), copyRules: false };
      this.formOpen = true;
    },

    edit(s: Season) {
      this.editing = s;
      this.form = { name: s.name ?? '', startDate: s.startDate, endDate: s.endDate, copyRules: false };
      this.formOpen = true;
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

    /** Roda uma ação, avisa e relê a lista. GRP-57: sem a permissão, os painéis fecham. */
    async run(action: () => Promise<unknown>, success: string) {
      this.saving = true;
      try {
        await action();
        this.$q.notify({ type: 'positive', message: success });
        this.formOpen = false;
        await this.load();
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) {
          this.formOpen = false;
          this.open = false;
          return;
        }
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },

    async save() {
      const name = this.form.name.trim();
      const editing = this.editing;
      await this.run(
        () =>
          editing
            ? competitionApi.updateSeason(this.group.id, editing.id, {
                // CMP-42: a versão da temporada que a tela mostra.
                version: editing.version,
                ...(name && { name }),
                startDate: this.form.startDate,
                endDate: this.form.endDate,
                copyRules: this.form.copyRules,
              })
            : competitionApi.createSeason(this.group.id, {
                ...(name && { name }),
                startDate: this.form.startDate,
                endDate: this.form.endDate,
              }),
        this.$t('competition.seasons.saved'),
      );
    },

    async cancelSeason(s: Season) {
      if (!(await this.ask(this.$t('competition.seasons.cancelConfirm')))) return;
      await this.run(
        () => competitionApi.deleteSeason(this.group.id, s.id, { version: s.version }),
        this.$t('competition.seasons.removed'),
      );
    },

    /** CMP-32, 35: encerrar antes da data pede confirmação, porque trava os jogos dela. */
    async closeSeason(s: Season) {
      if (!(await this.ask(this.$t('competition.seasons.closeConfirm')))) return;
      await this.run(
        () => competitionApi.closeSeason(this.group.id, s.id),
        this.$t('competition.seasons.closedToast'),
      );
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow icon="event" :title="$t('competition.seasons.title')" :summary="summary" @open="open = true" />

    <BottomSheet v-model="open" :title="$t('competition.seasons.title')" :persistent="saving">
      <div class="sc-caption q-mt-xs">{{ $t('competition.seasons.rulesHint') }}</div>

      <div v-if="current" class="item">
        <div>
          <div class="sc-display item-name">{{ title(current) }}</div>
          <div class="sc-caption">{{ status(current) }}</div>
        </div>
        <!-- CMP-35: "Encerrar agora" só na aberta; no prazo, ela já terminou. -->
        <q-btn
          v-if="current.state === 'open'"
          flat
          no-caps
          class="sc-btn-outline danger"
          :label="$t('competition.seasons.closeNow')"
          :disable="saving"
          @click="closeSeason(current)"
        />
      </div>

      <div v-if="scheduled" class="item">
        <div>
          <div class="sc-display item-name">{{ title(scheduled) }}</div>
          <div class="sc-caption">{{ status(scheduled) }}</div>
        </div>
        <div class="item-actions">
          <q-btn flat no-caps dense :label="$t('competition.seasons.edit')" :disable="saving" @click="edit(scheduled)" />
          <q-btn
            flat
            no-caps
            dense
            :label="$t('competition.seasons.cancelSeason')"
            :disable="saving"
            @click="cancelSeason(scheduled)"
          />
        </div>
      </div>

      <q-btn
        unelevated
        no-caps
        color="primary"
        class="sc-btn-main new"
        icon="add"
        :label="$t('competition.seasons.newTitle')"
        :disable="saving"
        @click="newSeason"
      />
    </BottomSheet>

    <BottomSheet
      v-model="formOpen"
      :title="editing ? $t('competition.seasons.editTitle') : $t('competition.seasons.newTitle')"
      :persistent="saving"
    >
      <q-input v-model="form.name" :label="$t('competition.seasons.name')" :maxlength="40" :disable="saving" />
      <q-input v-model="form.startDate" type="date" :label="$t('competition.seasons.start')" :disable="saving" />
      <q-input v-model="form.endDate" type="date" :label="$t('competition.seasons.end')" :disable="saving" />
      <q-toggle
        v-if="editing"
        v-model="form.copyRules"
        :label="$t('competition.seasons.copyRules')"
        :disable="saving"
      />
      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="formOpen = false" />
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="form.startDate === today ? $t('competition.seasons.openNow') : $t('competition.seasons.schedule')"
          :loading="saving"
          @click="save"
        />
      </div>
    </BottomSheet>
  </section>
</template>

<style scoped>
.item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.item-name {
  font-size: 17px;
}

.item-actions {
  display: flex;
  flex-shrink: 0;
}

.danger {
  border: 1px solid var(--sc-danger);
  color: var(--sc-danger);
}

.new {
  width: 100%;
  margin-top: 16px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 18px;
}
</style>
