import type { CreateItemInput, Item } from '@base/web/src/modules/items/item.schema';
import { itemsApi } from '@base/web/src/modules/items/items.api';
import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useItemsStore = defineStore('items', () => {
  const items = ref<Item[]>([]);
  const loading = ref(false);

  async function fetchAll() {
    loading.value = true;
    try {
      items.value = await itemsApi.list();
    } finally {
      loading.value = false;
    }
  }

  async function create(input: CreateItemInput) {
    const item = await itemsApi.create(input);
    items.value = [item, ...items.value];
  }

  return { items, loading, fetchAll, create };
});
