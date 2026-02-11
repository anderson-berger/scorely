<template>
  <div class="match-filters">
    <q-btn
      flat
      dense
      no-caps
      :icon="isOpen ? 'expand_less' : 'filter_list'"
      :label="activeCount > 0 ? `Filtros (${activeCount})` : 'Filtros'"
      class="filter-toggle"
      @click="isOpen = !isOpen"
    />

    <q-slide-transition>
      <div v-show="isOpen" class="filters-panel q-mt-sm">
        <!-- Status -->
        <div class="filter-group">
          <span class="filter-label text-caption text-grey-5">Status</span>
          <div class="filter-chips">
            <q-chip
              v-for="option in statusOptions"
              :key="option.value"
              :selected="filters.status.includes(option.value)"
              :color="filters.status.includes(option.value) ? option.color : 'grey-9'"
              text-color="white"
              clickable
              size="sm"
              @click="toggleStatus(option.value)"
            >
              {{ option.label }}
            </q-chip>
          </div>
        </div>

        <!-- Papel -->
        <div class="filter-group">
          <span class="filter-label text-caption text-grey-5">Meu papel</span>
          <div class="filter-chips">
            <q-chip
              v-for="option in roleOptions"
              :key="option.value"
              :selected="filters.role.includes(option.value)"
              :color="filters.role.includes(option.value) ? 'primary' : 'grey-9'"
              text-color="white"
              clickable
              size="sm"
              @click="toggleRole(option.value)"
            >
              {{ option.label }}
            </q-chip>
          </div>
        </div>

        <!-- Esporte -->
        <div class="filter-group">
          <span class="filter-label text-caption text-grey-5">Esporte</span>
          <div class="filter-chips">
            <q-chip
              v-for="option in sportOptions"
              :key="option.value"
              :selected="filters.sport.includes(option.value)"
              :color="filters.sport.includes(option.value) ? 'orange-8' : 'grey-9'"
              text-color="white"
              clickable
              size="sm"
              @click="toggleSport(option.value)"
            >
              {{ option.label }}
            </q-chip>
          </div>
        </div>

        <!-- Período -->
        <div class="filter-group">
          <span class="filter-label text-caption text-grey-5">Período</span>
          <q-select
            v-model="filters.period"
            :options="periodOptions"
            dense
            dark
            outlined
            emit-value
            map-options
            class="period-select"
            @update:model-value="emitFilters"
          />
        </div>

        <!-- Limpar -->
        <q-btn
          v-if="activeCount > 0"
          flat
          dense
          no-caps
          label="Limpar filtros"
          color="red-4"
          size="sm"
          class="q-mt-xs"
          @click="clearFilters"
        />
      </div>
    </q-slide-transition>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';

export interface MatchFilterState {
  status: string[];
  role: string[];
  sport: string[];
  period: string;
}

export default defineComponent({
  name: 'MatchFilters',

  emits: ['update:filters'],

  data() {
    return {
      isOpen: false,
      filters: {
        status: [],
        role: [],
        sport: [],
        period: 'all',
      } as MatchFilterState,

      statusOptions: [
        { value: 'scheduled', label: 'Agendada', color: 'blue-grey' },
        { value: 'in_progress', label: 'Em andamento', color: 'green' },
        { value: 'finished', label: 'Finalizada', color: 'grey-7' },
        { value: 'cancelled', label: 'Cancelada', color: 'red-4' },
      ],

      roleOptions: [
        { value: 'creator', label: 'Criadas por mim' },
        { value: 'member', label: 'Participo' },
      ],

      sportOptions: [
        { value: 'futsal', label: 'Futsal' },
        { value: 'volleyball', label: 'Vôlei' },
        { value: 'basketball', label: 'Basquete' },
      ],

      periodOptions: [
        { value: 'all', label: 'Todas' },
        { value: 'today', label: 'Hoje' },
        { value: 'week', label: 'Esta semana' },
        { value: 'month', label: 'Este mês' },
      ],
    };
  },

  computed: {
    activeCount(): number {
      let count = 0;
      if (this.filters.status.length > 0) count++;
      if (this.filters.role.length > 0) count++;
      if (this.filters.sport.length > 0) count++;
      if (this.filters.period !== 'all') count++;
      return count;
    },
  },

  methods: {
    toggleStatus(value: string) {
      const idx = this.filters.status.indexOf(value);
      if (idx >= 0) this.filters.status.splice(idx, 1);
      else this.filters.status.push(value);
      this.emitFilters();
    },

    toggleRole(value: string) {
      const idx = this.filters.role.indexOf(value);
      if (idx >= 0) this.filters.role.splice(idx, 1);
      else this.filters.role.push(value);
      this.emitFilters();
    },

    toggleSport(value: string) {
      const idx = this.filters.sport.indexOf(value);
      if (idx >= 0) this.filters.sport.splice(idx, 1);
      else this.filters.sport.push(value);
      this.emitFilters();
    },

    clearFilters() {
      this.filters.status = [];
      this.filters.role = [];
      this.filters.sport = [];
      this.filters.period = 'all';
      this.emitFilters();
    },

    emitFilters() {
      this.$emit('update:filters', { ...this.filters });
    },
  },
});
</script>

<style scoped>
.filter-toggle {
  color: #b5bac1;
}

.filters-panel {
  background: #2b2d31;
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-label {
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.period-select {
  max-width: 200px;
}
</style>
