<template>
  <q-dialog :model-value="show" persistent @update:model-value="$emit('update:show', $event)">
    <q-card dark style="min-width: 350px">
      <q-card-section class="row items-center">
        <q-icon name="warning" color="negative" size="32px" class="q-mr-md" />
        <span class="text-h6">Excluir conta</span>
      </q-card-section>

      <q-card-section>
        <p>Tem certeza que deseja excluir sua conta? Esta ação não pode ser desfeita.</p>
        <p class="text-grey-5">
          Digite <strong>EXCLUIR</strong> para confirmar:
        </p>
        <q-input
          :model-value="confirmation"
          @update:model-value="$emit('update:confirmation', $event)"
          dark
          filled
          dense
        />
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancelar" @click="$emit('cancel')" />
        <q-btn
          flat
          label="Excluir"
          color="negative"
          :disable="confirmation !== 'EXCLUIR'"
          @click="$emit('confirm')"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'DeleteAccountDialog',

  props: {
    show: {
      type: Boolean,
      default: false,
    },
    confirmation: {
      type: String,
      default: '',
    },
  },

  emits: ['update:show', 'update:confirmation', 'cancel', 'confirm'],
});
</script>
