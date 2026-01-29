<template>
  <q-card dark class="card-dark q-mb-md">
    <q-card-section>
      <div class="text-subtitle1 q-mb-md">Dados Pessoais</div>
      <!-- Avatar Upload -->
      <div class="row justify-center q-mb-lg">
        <AvatarUpload :avatar="avatar" @handler-file="onFile" />
      </div>
    </q-card-section>
    <q-card-actions align="right">
      <q-btn
        color="primary"
        label="Salvar alterações"
        :loading="$load.isLoading('save-user')"
        @click="$emit('save')"
      />
    </q-card-actions>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';
import type { User } from '@scorely/shared/schemas/user/user_schemas';

// components
import AvatarUpload from 'src/components/utils/AvatarUpload.vue';

export default defineComponent({
  name: 'ProfilePersonalDataForm',

  components: {
    AvatarUpload,
  },

  props: {
    item: {
      type: Object as PropType<User>,
      required: true,
    },
  },

  emits: ['handler-file', 'save'],

  computed: {
    user(): User {
      return this.item;
    },

    avatar(): string | undefined {
      return this.user.avatar;
    },
  },

  methods: {
    onFile(file: File) {
      this.$emit('handler-file', file);
      // lógica aqui
    },
  },

  created() {},

  mounted() {},
});
</script>

<style scoped>
/* Estilos locais aqui */
</style>
