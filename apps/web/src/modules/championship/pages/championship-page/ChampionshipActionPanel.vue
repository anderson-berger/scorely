<template>
  <q-card class="full-height q-pa-md">
    <template v-if="!action">
      <div class="column items-center justify-center full-height text-grey-6">
        <q-icon name="emoji_events" size="48px" />
        <div>Selecione ou crie um campeonato</div>
      </div>
    </template>

    <!-- CREATE / EDIT -->
    <template v-else-if="action === 'create' || action === 'edit'">
      <div class="text-h6 q-mb-md">
        {{ action === 'create' ? 'Criar campeonato' : 'Editar campeonato' }}
      </div>

      <q-input filled label="Nome" v-model="form.name" />
      <q-select
        filled
        label="Esporte"
        :options="['Futebol', 'Vôlei', 'Basquete']"
        v-model="form.sport"
        class="q-mt-sm"
      />

      <q-btn
        color="primary"
        class="q-mt-md"
        :label="action === 'create' ? 'Criar' : 'Salvar'"
        @click="submit"
      />
    </template>

    <!-- MANAGE -->
    <template v-else-if="action === 'manage'">
      <div class="text-h6 q-mb-md">Gerenciar campeonato</div>

      <q-banner class="bg-grey-2"> Convites de times, jogos e resultados (fake) </q-banner>
    </template>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { Championship } from 'src/services/api/ChampionshipService';

export default defineComponent({
  name: 'ChampionshipActionPanel',

  props: {
    championship: Object as PropType<Championship | null>,
    action: String as PropType<'create' | 'edit' | 'manage' | null>,
  },

  data() {
    return {
      form: { name: '', sport: '' },
    };
  },

  watch: {
    action: {
      immediate: true,
      handler() {
        if (this.action === 'edit' && this.championship) {
          this.form.name = this.championship.name ?? '';
          this.form.sport = this.championship.sport ?? '';
        }

        if (this.action === 'create') {
          this.form.name = '';
          this.form.sport = '';
        }
      },
    },
  },

  methods: {
    submit() {
      console.log(this.action, this.form);
    },
  },
});
</script>
