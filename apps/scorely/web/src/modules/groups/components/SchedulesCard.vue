<script lang="ts">
import { GROUP_LIMITS, type Group, type Place, type Schedule, ScheduleInputSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { onPermissionError, permissionLostInject } from '@scorely/web/src/modules/groups/permissions';
import { activeSchedules, scheduleText } from '@scorely/web/src/modules/groups/schedules';
import { defineComponent, type PropType } from 'vue';

/** O form do horário: vazio nas vagas, no mínimo e no lugar = os do grupo (GRP-66). */
interface ScheduleForm {
  weekday: number;
  start: string;
  end: string;
  placeId: string;
  slots: string;
  minPlayers: string;
}

const EMPTY: ScheduleForm = {
  weekday: 1,
  start: '19:00',
  end: '21:00',
  placeId: '',
  slots: '',
  minPlayers: '',
};

/** O número do campo, ou `undefined` vazio. */
const numberOf = (value: string) => (value.trim() ? Number(value) : undefined);

/**
 * Linha "Horários" dos Ajustes (GRP-29, 0): o resumo e, ao tocar, o painel dos horários (GRP-64–67): Editar, Arquivar,
 * "Adicionar horário" e os arquivados, com Desarquivar.
 */
export default defineComponent({
  name: 'SchedulesCard',

  components: { BottomSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: ['saved'],

  data() {
    return {
      open: false,
      /** `undefined` = a lista; `null` = horário novo; um horário = editando. */
      editing: undefined as Schedule | null | undefined,
      form: { ...EMPTY } as ScheduleForm,
      saving: false,
      schedules: [] as Schedule[],
      places: [] as Place[],
      limits: GROUP_LIMITS,
    };
  },

  computed: {
    active(): Schedule[] {
      return activeSchedules(this.schedules);
    },

    archived(): Schedule[] {
      return this.schedules.filter((s) => s.archivedAt);
    },

    /** "Ter 19:00–21:00 · Sáb 09:00–11:00" (os do grupo, mesmo antes de abrir o painel). */
    summary(): string {
      return activeSchedules(this.group.schedules)
        .map((s) => this.text(s))
        .join(' · ');
    },

    sheetTitle(): string {
      if (this.editing === undefined) return this.$t('groups.schedules.title');
      return this.editing ? this.$t('groups.schedules.editTitle') : this.$t('groups.schedules.newTitle');
    },

    weekdayOptions(): { label: string; value: number }[] {
      return [0, 1, 2, 3, 4, 5, 6].map((d) => ({ label: this.$t(`weekdays.${d}`), value: d }));
    },

    placeOptions(): { label: string; value: string }[] {
      return [
        { label: this.$t('groups.schedules.placeDefault'), value: '' },
        ...this.places.filter((p) => !p.archivedAt).map((p) => ({ label: p.name, value: p.id })),
      ];
    },
  },

  watch: {
    open(isOpen: boolean) {
      if (isOpen) void this.load();
      else this.editing = undefined;
    },
  },

  methods: {
    text(s: Pick<Schedule, 'weekday' | 'start' | 'end'>): string {
      return scheduleText(s, this.$t(`weekdaysShort.${s.weekday}`));
    },

    /** GRP-64: os horários (ativos e arquivados) e os lugares para a escolha. */
    async load() {
      try {
        [this.schedules, this.places] = await Promise.all([
          groupsApi.schedules(this.group.id),
          groupsApi.places(this.group.id),
        ]);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      }
    },

    startNew() {
      this.form = { ...EMPTY };
      this.editing = null;
    },

    startEdit(s: Schedule) {
      this.form = {
        weekday: s.weekday,
        start: s.start,
        end: s.end,
        placeId: s.placeId ?? '',
        slots: s.slots === undefined ? '' : String(s.slots),
        minPlayers: s.minPlayers === undefined ? '' : String(s.minPlayers),
      };
      this.editing = s;
    },

    /** Uma ação; conflito ou permissão perdida (GRP-57, ADR 0016) fecham o painel e recarregam a página. */
    async run(action: () => Promise<unknown>, success?: string): Promise<boolean> {
      this.saving = true;
      try {
        await action();
        if (success) this.$q.notify({ type: 'positive', message: success });
        await this.load();
        this.$emit('saved');
        return true;
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) this.open = false;
        else this.$q.notify({ type: 'negative', message: errorMessage(err) });
        return false;
      } finally {
        this.saving = false;
      }
    },

    async save() {
      const f = this.form;
      const slots = numberOf(f.slots);
      const minPlayers = numberOf(f.minPlayers);
      const parsed = ScheduleInputSchema.safeParse({
        weekday: f.weekday,
        start: f.start,
        end: f.end,
        ...(f.placeId && { placeId: f.placeId }),
        ...(slots !== undefined && { slots }),
        ...(minPlayers !== undefined && { minPlayers }),
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        this.$q.notify({ type: 'warning', message: issueMessage(issue, String(issue?.path[0] ?? '')) });
        return;
      }
      const editing = this.editing;
      const ok = await this.run(
        () =>
          editing
            ? groupsApi.updateSchedule(this.group.id, editing.id, {
                ...parsed.data,
                version: editing.version,
              })
            : groupsApi.createSchedule(this.group.id, parsed.data),
        this.$t('groups.schedules.saved'),
      );
      if (ok) this.editing = undefined;
    },

    /** GRP-67: arquivar cancela o próximo jogo do horário, então pede confirmação. */
    archive(s: Schedule) {
      this.$q
        .dialog({
          message: this.$t('groups.schedules.archiveConfirm'),
          cancel: { label: this.$t('groups.no'), flat: true },
          ok: { label: this.$t('groups.yes'), color: 'primary' },
          persistent: true,
        })
        .onOk(() => {
          void this.run(() => groupsApi.archiveSchedule(this.group.id, s.id, { version: s.version }));
        });
    },

    unarchive(s: Schedule) {
      return this.run(() => groupsApi.unarchiveSchedule(this.group.id, s.id, { version: s.version }));
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow icon="event" :title="$t('groups.schedules.title')" :summary="summary" @open="open = true" />

    <BottomSheet v-model="open" :title="sheetTitle" :persistent="saving">
      <template v-if="editing === undefined">
        <div class="sc-caption q-mt-xs">{{ $t('groups.schedules.hint') }}</div>
        <div v-for="s in active" :key="s.id" class="row">
          <div class="sc-display name">{{ text(s) }}</div>
          <q-btn flat round dense icon="more_vert" :aria-label="text(s)" :disable="saving">
            <q-menu>
              <q-list>
                <q-item v-close-popup clickable @click="startEdit(s)">
                  <q-item-section>{{ $t('groups.schedules.edit') }}</q-item-section>
                </q-item>
                <q-item v-close-popup clickable @click="archive(s)">
                  <q-item-section>{{ $t('groups.schedules.archive') }}</q-item-section>
                </q-item>
              </q-list>
            </q-menu>
          </q-btn>
        </div>
        <q-btn flat no-caps icon="add" class="q-mt-sm" :label="$t('groups.schedules.add')" @click="startNew" />

        <template v-if="archived.length > 0">
          <div class="sc-label archived-title">{{ $t('groups.schedules.archived') }}</div>
          <div v-for="s in archived" :key="s.id" class="row row--archived">
            <div class="sc-display name">{{ text(s) }}</div>
            <q-btn
              flat
              no-caps
              dense
              :label="$t('groups.schedules.unarchive')"
              :disable="saving"
              @click="unarchive(s)"
            />
          </div>
        </template>
      </template>

      <template v-else>
        <div class="form">
          <q-select
            v-model="form.weekday"
            outlined
            dense
            emit-value
            map-options
            :options="weekdayOptions"
            :label="$t('groups.schedules.weekday')"
          />
          <div class="pair">
            <q-input v-model="form.start" type="time" outlined dense :label="$t('groups.start')" />
            <q-input v-model="form.end" type="time" outlined dense :label="$t('groups.end')" />
          </div>
          <q-select
            v-model="form.placeId"
            outlined
            dense
            emit-value
            map-options
            :options="placeOptions"
            :label="$t('groups.schedules.place')"
          />
          <div class="pair">
            <q-input
              v-model="form.slots"
              type="number"
              outlined
              dense
              :min="limits.slots.min"
              :max="limits.slots.max"
              :label="$t('groups.schedules.slots')"
              :hint="$t('groups.schedules.groupValue', { value: group.slots })"
            />
            <q-input
              v-model="form.minPlayers"
              type="number"
              outlined
              dense
              :min="limits.minPlayers.min"
              :max="limits.minPlayers.max"
              :label="$t('groups.schedules.minPlayers')"
              :hint="
                $t('groups.schedules.groupValue', { value: group.minPlayers ?? $t('groups.schedules.noMin') })
              "
            />
          </div>
        </div>

        <div class="actions">
          <q-btn
            flat
            no-caps
            class="sc-btn-outline"
            :label="$t('groups.cancel')"
            :disable="saving"
            @click="editing = undefined"
          />
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
  </section>
</template>

<style scoped>
.row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0;
  border-bottom: 1px solid var(--sc-line);
}

.row--archived {
  opacity: 0.7;
}

.name {
  font-size: 18px;
}

.archived-title {
  margin-top: 16px;
  color: var(--sc-muted);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 8px;
}

.pair {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}
</style>
