<template>
  <q-card class="full-height">
    <!-- EMPTY -->
    <template v-if="!action">
      <div class="column items-center justify-center full-height text-grey-6">
        <q-icon name="groups" size="48px" />
        <div class="q-mt-sm">Selecione um time ou crie um novo</div>
      </div>
    </template>

    <!-- CREATE / EDIT -->
    <template v-else-if="action === 'create' || action === 'edit'">
      <div class="text-h6 text-weight-bold q-mb-md">
        {{ action === 'create' ? 'Criar time' : 'Editar time' }}
      </div>

      <q-input filled label="Nome do time" v-model="form.name" />

      <q-input
        filled
        type="textarea"
        label="Descrição"
        class="q-mt-sm"
        v-model="form.description"
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
      <div class="text-h6 text-weight-bold q-mb-md">Gerenciar membros</div>

      <q-banner class="bg-grey-2"> Área de membros (fake por enquanto) </q-banner>
    </template>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export default defineComponent({
  name: 'TeamActionPanel',
  data() {
    return {
      form: {
        name: '',
        description: '',
      },
    };
  },
  props: {
    team: Object,
    action: String as PropType<'create' | 'edit' | 'manage' | null>,
  },
  methods: {
    submit() {
      if (this.action === 'create') {
        console.log('Criar time', this.form);
      }

      if (this.action === 'edit') {
        console.log('Editar time', this.form);
      }
    },
  },
  watch: {
    action: {
      immediate: true,
      handler() {
        if (this.action === 'edit' && this.team) {
          this.form.name = this.team.name;
          this.form.description = this.team.description;
        }

        if (this.action === 'create') {
          this.form.name = '';
          this.form.description = '';
        }
      },
    },
  },

  computed: {
    currentActionLabel(): string {
      if (this.action === 'edit') return 'Editar equipe';
      if (this.action === 'manage') return 'Gerenciar membros';
      return 'Detalhes';
    },
  },
});
</script>
