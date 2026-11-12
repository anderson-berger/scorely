<script lang="ts">
import { CreateGroupInputSchema, type Sport, SportSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import HoursStepper from '@scorely/web/src/components/HoursStepper.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { detectTimeZone } from '@scorely/web/src/lib/datetime';
import { effectiveTimeZone } from '@scorely/web/src/lib/preferences';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { stepSlots } from '@scorely/web/src/modules/groups/layers';
import { defineComponent } from 'vue';

interface Option<T> {
  label: string;
  value: T;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

/**
 * Criar grupo no painel de baixo, por cima da tela de Grupos (GRP-34). É a rota filha `/groups/new`:
 * abre aberto, e fechar (Cancelar, fora do painel ou criar) espera a animação e volta para `/groups`.
 * Não manda nenhuma camada: os padrões são da api (GRP-15).
 */
export default defineComponent({
  name: 'GroupCreateForm',

  components: { BottomSheet, HoursStepper },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      open: true,
      name: '',
      sport: 'volleyball' as Sport,
      weekday: 5 as number,
      time: '19:00',
      slots: 12,
      saving: false,
      /** Para onde ir quando o painel terminar de fechar: o grupo criado, ou de volta à lista. */
      createdId: '',
    };
  },

  computed: {
    sportOptions(): Option<Sport>[] {
      return SportSchema.options.map((value) => ({ label: this.$t(`sports.${value}`), value }));
    },

    weekdayOptions(): (Option<number> & { letter: string })[] {
      return WEEKDAYS.map((value) => ({
        label: this.$t(`weekdays.${value}`),
        letter: this.$t(`weekdaysLetter.${value}`),
        value,
      }));
    },

    /** Fuso do grupo: o das preferências, ou o detectado. Vai no pedido, para o aviso mostrar o que vale (GRP-13). */
    timeZone(): string {
      return effectiveTimeZone({
        ...(this.auth.user && { user: this.auth.user.preferences }),
        detected: detectTimeZone(),
      });
    },
  },

  methods: {
    stepSlots(dir: 1 | -1) {
      this.slots = stepSlots(this.slots, dir);
    },

    /** Chamado quando o painel termina de fechar. */
    async closed() {
      if (this.createdId) {
        await this.$router.replace({ name: 'group', params: { id: this.createdId } });
        this.$q.notify({ type: 'positive', message: this.$t('groups.createdHint') });
        return;
      }
      if (this.$route.name === 'group-create') {
        await this.$router.replace({ name: 'groups', query: this.$route.query });
      }
    },

    async save() {
      const parsed = CreateGroupInputSchema.safeParse({
        name: this.name,
        sport: this.sport,
        weekday: this.weekday,
        time: this.time,
        timeZone: this.timeZone,
        slots: this.slots,
      });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        const group = await groupsApi.create(parsed.data);
        this.createdId = group.id;
        this.open = false;
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
  <BottomSheet v-model="open" :title="$t('groups.createTitle')" :persistent="saving" @hide="closed">
    <div class="sc-caption q-mt-xs">{{ $t('groups.createHint') }}</div>

    <q-form class="fields" @submit.prevent="save">
      <div>
        <label for="group-name" class="sc-label field-label">{{ $t('groups.name') }}</label>
        <q-input v-model="name" for="group-name" outlined autofocus />
      </div>

      <fieldset class="group">
        <legend class="sc-label field-label">{{ $t('groups.sport') }}</legend>
        <div class="chips chips--4">
          <button
            v-for="s in sportOptions"
            :key="s.value"
            type="button"
            class="chip"
            :class="{ 'chip--on': sport === s.value }"
            :aria-pressed="sport === s.value"
            @click="sport = s.value"
          >
            {{ s.label }}
          </button>
        </div>
      </fieldset>

      <fieldset class="group">
        <legend class="sc-label field-label">{{ $t('groups.weekday') }}</legend>
        <div class="chips chips--7">
          <button
            v-for="d in weekdayOptions"
            :key="d.value"
            type="button"
            class="chip chip--day sc-display"
            :class="{ 'chip--on': weekday === d.value }"
            :aria-label="d.label"
            :aria-pressed="weekday === d.value"
            @click="weekday = d.value"
          >
            {{ d.letter }}
          </button>
        </div>
      </fieldset>

      <div class="pair">
        <div>
          <label for="group-time" class="sc-label field-label">{{ $t('groups.time') }}</label>
          <q-input v-model="time" for="group-time" type="time" outlined input-class="time-input" />
        </div>
        <div>
          <div class="sc-label field-label">{{ $t('groups.slots') }}</div>
          <div class="slots">
            <HoursStepper
              :value="slots"
              :dec-label="$t('groups.lessSlots')"
              :inc-label="$t('groups.moreSlots')"
              @step="stepSlots"
            />
          </div>
        </div>
      </div>
      <div class="sc-caption">{{ $t('groups.timeZoneHint', { timeZone }) }}</div>

      <div class="actions">
        <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="saving" @click="open = false" />
        <q-btn type="submit" color="primary" unelevated class="sc-btn-main" :label="$t('groups.create')" :loading="saving" />
      </div>
    </q-form>
  </BottomSheet>
</template>

<style scoped>
.fields {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-top: 16px;
}

.field-label {
  display: block;
  margin-bottom: 8px;
  padding: 0;
}

.group {
  border: 0;
  margin: 0;
  padding: 0;
}

.chips {
  display: grid;
  gap: 6px;
}

.chips--4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.chips--7 {
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.chip {
  height: 44px;
  border-radius: 10px;
  border: 1px solid var(--sc-line-strong);
  background: var(--sc-surface);
  color: var(--sc-text);
  font: 600 14px var(--sc-font-body);
  cursor: pointer;
  padding: 0 4px;
}

.chip--day {
  font-family: var(--sc-font-display);
  font-size: 18px;
}

.chip--on {
  background: var(--sc-accent-soft);
  border-color: var(--sc-accent);
  color: var(--sc-accent);
}

.pair {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

:deep(.time-input) {
  font-family: var(--sc-font-display);
  font-weight: 700;
  font-size: 22px;
}

.slots {
  display: flex;
  justify-content: center;
  height: 56px;
  align-items: center;
  border-radius: 12px;
  border: 1px solid var(--sc-line-strong);
  background: var(--sc-surface);
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 4px;
}
</style>
