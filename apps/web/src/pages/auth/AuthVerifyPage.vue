<template>
  <q-page class="flex flex-center">
    <q-card class="verify-card">
      <q-card-section class="text-center">
        <template v-if="$load.isLoading('verify')">
          <q-spinner-dots color="primary" size="50px" />
          <p class="q-mt-md text-grey-6">Verificando...</p>
        </template>

        <template v-else-if="error">
          <q-icon name="error" color="negative" size="50px" />
          <p class="q-mt-md text-negative">{{ error }}</p>
          <q-btn
            flat
            no-caps
            color="primary"
            label="Voltar para login"
            @click="$router.push('/')"
          />
        </template>

        <template v-else>
          <q-icon name="check_circle" color="positive" size="50px" />
          <p class="q-mt-md text-positive">Login realizado com sucesso!</p>
          <p class="text-grey-6">Redirecionando...</p>
        </template>
      </q-card-section>
    </q-card>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import AuthService from 'src/services/api/AuthService';
import { authStore } from 'src/services/stores/AuthStore';

export default defineComponent({
  name: 'AuthVerifyPage',

  data() {
    return {
      error: '',
    };
  },

  async mounted() {
    const token = this.$route.query.token as string;

    if (!token) {
      this.error = 'Token de verificacao nao encontrado';
      return;
    }

    await this.$load.execute('verify', async () => {
      try {
        const { token: accessToken } = await AuthService.verifyMagicLink(token);
        authStore.setTokens(accessToken);

        setTimeout(() => {
          void this.$router.push({ name: 'app.index' });
        }, 1500);
      } catch {
        this.error = 'Token invalido ou expirado';
      }
    });
  },
});
</script>

<style scoped>
.verify-card {
  min-width: 300px;
  padding: 24px;
}
</style>
