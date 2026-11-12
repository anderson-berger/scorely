<script lang="ts">
import { CreateItemInputSchema } from '@base/web/src/modules/items/item.schema';
import { useItemsStore } from '@base/web/src/modules/items/items.store';
import { defineComponent } from 'vue';

export default defineComponent({
  name: 'ItemsPage',

  setup() {
    return { store: useItemsStore() };
  },

  data() {
    return {
      name: '',
    };
  },

  mounted() {
    this.store.fetchAll().catch((err: Error) => this.$q.notify({ type: 'negative', message: err.message }));
  },

  methods: {
    async submit() {
      const parsed = CreateItemInputSchema.safeParse({ name: this.name });
      if (!parsed.success) {
        this.$q.notify({ type: 'warning', message: parsed.error.issues[0]?.message ?? 'Inválido' });
        return;
      }
      try {
        await this.store.create(parsed.data);
        this.name = '';
      } catch (err) {
        this.$q.notify({ type: 'negative', message: (err as Error).message });
      }
    },
  },
});
</script>

<template>
  <q-page padding>
    <q-form class="row q-gutter-sm q-mb-md" @submit.prevent="submit">
      <q-input v-model="name" label="Novo item" dense outlined class="col" />
      <q-btn type="submit" color="primary" label="Adicionar" />
    </q-form>

    <q-list bordered separator>
      <q-item v-if="store.loading"><q-item-section><q-spinner /></q-item-section></q-item>
      <q-item v-for="item in store.items" :key="item.id">
        <q-item-section>
          <q-item-label>{{ item.name }}</q-item-label>
          <q-item-label caption>{{ new Date(item.createdAt).toLocaleString() }}</q-item-label>
        </q-item-section>
      </q-item>
      <q-item v-if="!store.loading && store.items.length === 0">
        <q-item-section class="text-grey">Nenhum item ainda</q-item-section>
      </q-item>
    </q-list>
  </q-page>
</template>
