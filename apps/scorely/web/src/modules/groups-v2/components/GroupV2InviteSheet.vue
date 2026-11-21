<script lang="ts">
import { CreateGroupInviteV2InputSchema, type GroupInviteV2, type GroupTierV2 } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { groupsV2Api } from '@scorely/web/src/modules/groups-v2/groups-v2.api';
import { canShare, inviteUrl } from '@scorely/web/src/modules/groups-v2/invite-link';
import { copyToClipboard } from 'quasar';
import { defineComponent } from 'vue';

const VALIDITY_OPTIONS = [1, 7, 30, null] as const;
const MAX_USES_OPTIONS = [1, 5, 10, 25, null] as const;

/**
 * GRV-33: o painel de criar o convite. Os valores já vêm no padrão do contrato (a api decide, GRV-18); criado, o painel
 * mostra o link com Copiar e Compartilhar. Etapa B acrescenta o "Para quem".
 */
export default defineComponent({
  name: 'GroupV2InviteSheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    groupId: { type: String, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    created: (_invite: GroupInviteV2) => true,
  },

  data() {
    return {
      form: CreateGroupInviteV2InputSchema.parse({}),
      saving: false,
      invite: undefined as GroupInviteV2 | undefined,
      validityOptions: VALIDITY_OPTIONS.map((value) => ({ value })),
      maxUsesOptions: MAX_USES_OPTIONS.map((value) => ({ value })),
    };
  },

  computed: {
    url(): string {
      return this.invite ? inviteUrl(this.invite.token) : '';
    },

    shareable(): boolean {
      return canShare();
    },
  },

  watch: {
    modelValue(open: boolean) {
      if (open) {
        this.form = CreateGroupInviteV2InputSchema.parse({});
        this.invite = undefined;
      }
    },
  },

  methods: {
    tierLabel(tier: GroupTierV2): string {
      return this.$t(`groupsV2.tier.${tier}`);
    },

    validityLabel(days: number | null): string {
      if (days === null) return this.$t('groupsV2.invite.noExpiry');
      return days === 1
        ? this.$t('groupsV2.invite.oneDay')
        : this.$t('groupsV2.invite.days', { count: days });
    },

    maxUsesLabel(max: number | null): string {
      return max === null ? this.$t('groupsV2.invite.noLimit') : String(max);
    },

    async save() {
      this.saving = true;
      try {
        this.invite = await groupsV2Api.createInvite(this.groupId, this.form);
        this.$emit('created', this.invite);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },

    async copy() {
      await copyToClipboard(this.url);
      this.$q.notify({ type: 'positive', message: this.$t('groupsV2.invite.copied') });
    },

    async share() {
      try {
        await navigator.share({ title: this.$t('groupsV2.invite.shareTitle'), url: this.url });
      } catch {
        // a pessoa fechou o compartilhar: nada a fazer
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="$t('groupsV2.invite.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div v-if="invite" class="fields">
      <div class="sc-caption">{{ $t('groupsV2.invite.createdHint') }}</div>
      <q-input :model-value="url" readonly outlined dense :aria-label="$t('groupsV2.invite.link')" />
      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('groupsV2.invite.copy')"
          icon="content_copy"
          @click="copy"
        />
        <q-btn
          v-if="shareable"
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('groupsV2.invite.share')"
          icon="share"
          @click="share"
        />
        <q-btn
          color="primary"
          unelevated
          no-caps
          class="sc-btn-main"
          :label="$t('groupsV2.invite.done')"
          @click="$emit('update:modelValue', false)"
        />
      </div>
    </div>

    <q-form v-else class="fields" @submit.prevent="save">
      <div class="sc-caption">{{ $t('groupsV2.invite.hint') }}</div>

      <div>
        <div class="sc-label field-label">{{ $t('groupsV2.invite.joinAs') }}</div>
        <q-btn-toggle
          v-model="form.tier"
          no-caps
          unelevated
          toggle-color="primary"
          :options="[
            { label: tierLabel('member'), value: 'member' },
            { label: tierLabel('reserve'), value: 'reserve' },
          ]"
        />
      </div>

      <div>
        <div class="sc-label field-label">{{ $t('groupsV2.invite.validity') }}</div>
        <q-btn-toggle
          v-model="form.validityDays"
          no-caps
          unelevated
          toggle-color="primary"
          :options="validityOptions.map((o) => ({ label: validityLabel(o.value), value: o.value }))"
        />
      </div>

      <div>
        <div class="sc-label field-label">{{ $t('groupsV2.invite.maxUses') }}</div>
        <q-btn-toggle
          v-model="form.maxUses"
          no-caps
          unelevated
          toggle-color="primary"
          :options="maxUsesOptions.map((o) => ({ label: maxUsesLabel(o.value), value: o.value }))"
        />
      </div>

      <div class="actions">
        <q-btn
          flat
          no-caps
          class="sc-btn-outline"
          :label="$t('groupsV2.cancel')"
          :disable="saving"
          @click="$emit('update:modelValue', false)"
        />
        <q-btn
          type="submit"
          color="primary"
          unelevated
          class="sc-btn-main"
          :label="$t('groupsV2.invite.create')"
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

.field-label {
  display: block;
  margin-bottom: 6px;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.fields :deep(.q-btn-group) {
  flex-wrap: wrap;
}
</style>
