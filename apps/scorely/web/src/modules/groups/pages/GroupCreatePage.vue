<script lang="ts">
import { CreateGroupInputSchema, GROUP_LIMITS, type Sport, SportSchema } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage, issueMessage } from '@/i18n/errors';
import { detectTimeZone } from '@/lib/datetime';
import { effectiveTimeZone } from '@/lib/preferences';
import { useAuthStore } from '../../auth/auth.store';
import { groupsApi } from '../groups.api';

interface Option<T> {
  label: string;
  value: T;
}

const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6] as const;

export default defineComponent({
  name: 'GroupCreatePage',

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      name: '',
      sport: 'volleyball' as Sport,
      weekday: 5 as number,
      time: '19:00',
      location: '',
      slots: 12 as number | string,
      listOpensHoursBefore: 48 as number | string,
      limits: GROUP_LIMITS,
      saving: false,
    };
  },

  computed: {
    sportOptions(): Option<Sport>[] {
      return SportSchema.options.map((value) => ({ label: this.$t(`sports.${value}`), value }));
    },

    weekdayOptions(): Option<number>[] {
      return WEEKDAYS.map((value) => ({ label: this.$t(`weekdays.${value}`), value }));
    },

    /** Fuso do grupo: o do perfil, ou o detectado. Vai no pedido, para o aviso mostrar o que vale. */
    timeZone(): string {
      return effectiveTimeZone({
        ...(this.auth.user && { user: this.auth.user }),
        detected: detectTimeZone(),
      });
    },
  },

  methods: {
    async save() {
      const parsed = CreateGroupInputSchema.safeParse({
        name: this.name,
        sport: this.sport,
        weekday: this.weekday,
        time: this.time,
        timeZone: this.timeZone,
        ...(this.location.trim() && { location: this.location }),
        slots: Number(this.slots),
        listOpensHoursBefore: Number(this.listOpensHoursBefore),
      });
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0]) });
      }
      this.saving = true;
      try {
        const group = await groupsApi.create(parsed.data);
        await this.$router.replace({ name: 'group', params: { id: group.id } });
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
  <q-page padding>
    <div class="page">
      <div class="text-h5 q-mb-md">{{ $t('groups.createTitle') }}</div>
      <q-form class="q-gutter-md" @submit.prevent="save">
        <q-input v-model="name" :label="$t('groups.name')" outlined />
        <q-select
          v-model="sport"
          :options="sportOptions"
          :label="$t('groups.sport')"
          emit-value
          map-options
          outlined
        />
        <div class="row q-col-gutter-md">
          <q-select
            v-model="weekday"
            class="col-7"
            :options="weekdayOptions"
            :label="$t('groups.weekday')"
            emit-value
            map-options
            outlined
          />
          <q-input v-model="time" class="col-5" type="time" :label="$t('groups.time')" outlined />
        </div>
        <div class="text-caption text-grey-7">{{ $t('groups.timeZoneHint', { timeZone }) }}</div>
        <q-input v-model="location" :label="$t('groups.location')" outlined />
        <q-input
          v-model="slots"
          type="number"
          :min="limits.slots.min"
          :max="limits.slots.max"
          :label="$t('groups.slots')"
          outlined
        />
        <q-input
          v-model="listOpensHoursBefore"
          type="number"
          :min="limits.listOpensHoursBefore.min"
          :max="limits.listOpensHoursBefore.max"
          :label="$t('groups.listOpensHoursBefore')"
          :hint="$t('groups.listOpensHoursBeforeHint')"
          outlined
        />
        <q-btn type="submit" color="primary" :label="$t('groups.create')" :loading="saving" />
      </q-form>
    </div>
  </q-page>
</template>

<style scoped>
.page {
  max-width: 480px;
  margin: 0 auto;
}
</style>
