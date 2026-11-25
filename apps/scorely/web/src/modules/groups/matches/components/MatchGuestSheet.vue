<script lang="ts">
import { MATCH_LIMITS, type Match, MatchGuestNameSchema } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { matchesApi } from '@scorely/web/src/modules/groups/matches/matches.api';
import { defineComponent } from 'vue';

/** PAR-12: pedir para trazer um convidado, só com o nome. Quem organiza libera (PAR-13). */
export default defineComponent({
  name: 'MatchGuestSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
    matchId: { type: String, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    saved: (_match: Match) => true,
  },

  data() {
    return { name: '', saving: false, max: MATCH_LIMITS.guestName };
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.name = '';
    },
  },

  methods: {
    async save() {
      const parsed = MatchGuestNameSchema.safeParse(this.name);
      if (!parsed.success) {
        this.$q.notify({ type: 'negative', message: issueMessage(parsed.error.issues[0], 'name') });
        return;
      }
      this.saving = true;
      try {
        this.$emit('saved', await matchesApi.requestGuest(this.groupId, this.matchId, { name: parsed.data }));
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
  <BottomSheet
    :model-value="modelValue"
    :title="$t('matches.guest.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <q-form class="fields" @submit.prevent="save">
      <div class="sc-caption">{{ $t('matches.guest.hint') }}</div>
      <q-input v-model="name" outlined dense autofocus :maxlength="max" :label="$t('matches.guest.name')" />
      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('matches.form.cancel')"
          :disable="saving"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t('matches.guest.send')"
          :loading="saving"
        />
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

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
