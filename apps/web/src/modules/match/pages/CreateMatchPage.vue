<template>
  <q-page class="create-match-page q-pa-lg">
    <div class="row items-center q-mb-lg">
      <q-btn flat round icon="arrow_back" color="grey-5" :to="{ name: 'app.matches' }" />
      <span class="text-h6 text-white q-ml-sm">Nova Partida</span>
    </div>

    <q-card flat class="form-card q-pa-lg" style="max-width: 560px">
      <q-form @submit.prevent="onSubmit">
        <div class="text-subtitle2 text-grey-4 q-mb-md">Modalidade</div>
        <div class="row q-gutter-sm q-mb-lg">
          <q-btn
            v-for="sport in sportOptions"
            :key="sport.value"
            :icon="sport.icon"
            :label="sport.label"
            :color="form.sport === sport.value ? 'primary' : 'grey-8'"
            :text-color="form.sport === sport.value ? 'white' : 'grey-4'"
            no-caps
            unelevated
            size="sm"
            @click="form.sport = sport.value"
          />
        </div>

        <q-input
          v-model="form.date"
          type="datetime-local"
          label="Data e hora"
          filled
          dark
          class="q-mb-md"
          :rules="[(v) => !!v || 'Campo obrigatório']"
        />

        <q-input
          v-model.number="form.maxPlayers"
          type="number"
          label="Máx. jogadores"
          filled
          dark
          class="q-mb-md"
          :min="2"
          :max="100"
          :rules="[(v) => v >= 2 || 'Mínimo 2 jogadores']"
        />

        <div class="text-subtitle2 text-grey-4 q-mb-sm">Visibilidade</div>
        <q-btn-toggle
          v-model="form.visibility"
          :options="visibilityOptions"
          color="grey-8"
          text-color="grey-4"
          toggle-color="primary"
          toggle-text-color="white"
          unelevated
          no-caps
          class="q-mb-lg"
        />

        <q-btn
          type="submit"
          color="primary"
          label="Criar Partida"
          no-caps
          unelevated
          class="full-width"
          :loading="loading"
        />
      </q-form>
    </q-card>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { matchStore } from 'src/modules/match/store/matchStore';
import { SPORT_ICON, SPORT_LABEL } from 'src/modules/match/types/match.ui.types';
import type { MatchSport, MatchVisibility } from 'src/modules/match/types/match.ui.types';
import type { NewMatch } from '@scorely/api/modules/match/match_types';

interface FormState {
  sport: MatchSport;
  date: string;
  maxPlayers: number;
  visibility: MatchVisibility;
  locationId: string;
}

export default defineComponent({
  name: 'CreateMatchPage',

  data() {
    return {
      form: {
        sport: 'FUTSAL',
        date: '',
        maxPlayers: 10,
        visibility: 'PUBLIC',
        locationId: '',
      } as FormState,
      sportOptions: (Object.keys(SPORT_LABEL) as MatchSport[]).map((s) => ({
        value: s,
        label: SPORT_LABEL[s],
        icon: SPORT_ICON[s],
      })),
      visibilityOptions: [
        { label: 'Pública', value: 'PUBLIC' },
        { label: 'Privada', value: 'PRIVATE' },
      ],
    };
  },

  computed: {
    loading() {
      return matchStore.loading;
    },
  },

  methods: {
    async onSubmit() {
      const input: NewMatch = {
        sport: this.form.sport,
        date: new Date(this.form.date).toISOString(),
        maxPlayers: this.form.maxPlayers,
        visibility: this.form.visibility,
        ...(this.form.locationId ? { locationId: this.form.locationId } : {}),
      };

      try {
        const match = await matchStore.createMatch(input);
        await this.$router.push({ name: 'app.match.detail', params: { id: match.id } });
      } catch {
        // error is stored in matchStore.error
      }
    },
  },
});
</script>

<style scoped>
.create-match-page {
  background: #313338;
  min-height: 100vh;
}

.form-card {
  background: #2b2d31;
  border-radius: 8px;
}
</style>
