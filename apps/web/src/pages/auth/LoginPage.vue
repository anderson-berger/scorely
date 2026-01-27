<template>
  <q-page class="flex flex-center">
    <q-card class="login-card">
      <q-card-section class="text-center q-pb-none">
        <q-icon name="sports_soccer" size="48px" color="primary" />
        <h5 class="q-mt-sm q-mb-none">Entrar no Scorely</h5>
        <p class="text-grey-6 q-mt-xs">Receba um link magico no seu email</p>
      </q-card-section>

      <q-card-section v-if="!emailSent">
        <q-form @submit.prevent="handleSendLink">
          <q-input
            v-model.trim="magicLink.email"
            outlined
            dense
            rounded
            label="Seu melhor email"
            placeholder="exemplo@email.com"
            type="email"
            :rules="[
              (val) => !!val || 'Email e obrigatorio',
              (val) => /.+@.+\..+/.test(val) || 'Email invalido',
            ]"
          >
            <template v-slot:prepend>
              <q-icon name="mail" />
            </template>
          </q-input>

          <q-btn
            type="submit"
            color="primary"
            text-color="dark"
            unelevated
            no-caps
            rounded
            :loading="$load.isLoading('send-email')"
            class="full-width q-mt-md"
            label="Enviar link magico"
          />
        </q-form>
      </q-card-section>

      <q-card-section v-else class="text-center">
        <q-icon name="mark_email_read" size="48px" color="positive" />
        <p class="q-mt-md">
          Enviamos um link para <strong>{{ magicLink.email }}</strong>
        </p>
        <p class="text-grey-6">Verifique sua caixa de entrada</p>
        <q-btn flat no-caps color="primary" label="Usar outro email" @click="emailSent = false" />
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import AuthService from 'src/services/api/AuthService';
import type { MagicLink } from '@scorely/shared/schemas/auth';

export default defineComponent({
  name: 'LoginPage',

  data() {
    const magicLink: MagicLink = {
      email: '',
    };
    return {
      magicLink,
      emailSent: false,
    };
  },

  methods: {
    async handleSendLink() {
      await this.$load.execute('send-email', async () => {
        await AuthService.sendMagicLink(this.magicLink);
        this.emailSent = true;
      });
    },
  },
});
</script>

<style scoped>
.login-card {
  min-width: 340px;
  max-width: 400px;
}
</style>
