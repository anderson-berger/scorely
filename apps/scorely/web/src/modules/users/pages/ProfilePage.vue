<script lang="ts">
import { type Gender, UpdateMeInputSchema } from '@scorely/contracts';
import { defineComponent } from 'vue';
import { errorMessage, issueMessage } from '@/i18n/errors';
import { useAuthStore } from '../../auth/auth.store';

export default defineComponent({
  name: 'ProfilePage',

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      name: '',
      nickname: '',
      gender: undefined as Gender | undefined,
      saving: false,
      genderOptions: [
        { label: 'Masculino', value: 'M' },
        { label: 'Feminino', value: 'F' },
      ],
    };
  },

  computed: {
    welcome(): boolean {
      return this.$route.query.welcome === '1';
    },
  },

  watch: {
    'auth.user': {
      immediate: true,
      deep: true,
      handler(u: ReturnType<typeof useAuthStore>['user']) {
        if (!u) return;
        this.name = u.name ?? '';
        this.nickname = u.nickname ?? '';
        this.gender = u.gender;
      },
    },
  },

  methods: {
    async save() {
      const parsed = UpdateMeInputSchema.safeParse({
        name: this.name,
        nickname: this.nickname.trim() ? this.nickname : null,
        ...(this.gender && { gender: this.gender }),
      });
      if (!parsed.success) {
        return this.$q.notify({
          type: 'warning',
          message: issueMessage(parsed.error.issues[0]),
        });
      }
      this.saving = true;
      try {
        await this.auth.updateProfile(parsed.data);
        this.$q.notify({ type: 'positive', message: 'Perfil salvo' });
        if (this.welcome) await this.$router.replace({ name: 'home' });
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
    <div class="profile">
      <div class="text-h5 q-mb-xs">{{ welcome ? 'Bem-vindo!' : 'Seu perfil' }}</div>
      <div v-if="welcome" class="text-body2 text-grey-7 q-mb-md">Conte como você quer aparecer nos grupos.</div>
      <div v-else class="text-body2 text-grey-7 q-mb-md">{{ auth.user?.email }}</div>

      <q-form class="q-gutter-md" @submit.prevent="save">
        <q-input v-model="name" label="Nome" outlined autocomplete="name" :rules="[(v) => !!v?.trim() || 'Informe o nome']" />
        <q-input v-model="nickname" label="Apelido (opcional)" outlined hint="É o nome que aparece nas listas" />
        <div>
          <div class="text-body2 q-mb-xs">Gênero</div>
          <q-option-group v-model="gender" :options="genderOptions" type="radio" inline />
          <div class="text-caption text-grey-7">Usado para montar times equilibrados em grupos mistos.</div>
        </div>
        <q-btn type="submit" color="primary" :label="welcome ? 'Continuar' : 'Salvar'" :loading="saving" />
      </q-form>
    </div>
  </q-page>
</template>

<style scoped>
.profile {
  max-width: 480px;
  margin: 0 auto;
}
</style>
