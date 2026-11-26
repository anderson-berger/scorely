<script lang="ts">
import { EmailSchema } from '@scorely/contracts';
import { errorMessage, issueMessage } from '@scorely/web/src/i18n/errors';
import { authApi } from '@scorely/web/src/modules/auth/auth.api';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'LoginEmailStep',

  props: {
    initialEmail: { type: String, default: '' },
  },

  emits: {
    sent: (_email: string, _resendInSeconds: number) => true,
  },

  data() {
    return {
      email: this.initialEmail,
      loading: false,
    };
  },

  methods: {
    async submit() {
      const parsed = EmailSchema.safeParse(this.email);
      if (!parsed.success) {
        return this.$q.notify({ type: 'warning', message: issueMessage(parsed.error.issues[0], 'email') });
      }
      this.loading = true;
      try {
        const result = await authApi.requestCode(parsed.data);
        this.$emit('sent', parsed.data, result.resendInSeconds);
      } catch (err) {
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.loading = false;
      }
    },
  },
});
</script>

<template>
  <q-form @submit.prevent="submit">
    <label for="login-email" class="sc-label field-label">{{ $t('login.email') }}</label>
    <q-input
      v-model="email"
      for="login-email"
      type="email"
      autocomplete="email"
      :placeholder="$t('login.emailPlaceholder')"
      outlined
      autofocus
      :disable="loading"
    />
    <q-btn
      type="submit"
      color="primary"
      unelevated
      class="full-width sc-btn-main q-mt-md"
      :label="$t('login.sendCode')"
      :loading="loading"
    />
    <div class="sc-caption text-center q-mt-sm">{{ $t('login.noPassword') }}</div>
  </q-form>
</template>

<style scoped>
.field-label {
  display: block;
  margin-bottom: 8px;
}
</style>
