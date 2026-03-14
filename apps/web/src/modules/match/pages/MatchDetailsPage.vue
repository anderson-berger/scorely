<template>
  <q-page class="match-details-page q-pa-lg">
    <div v-if="loading" class="flex flex-center q-mt-xl">
      <q-spinner color="primary" size="40px" />
    </div>

    <template v-else-if="match">
      <div class="row items-center q-mb-lg q-gutter-sm">
        <q-btn flat round icon="arrow_back" color="grey-5" :to="{ name: 'app.matches' }" />
        <div>
          <div class="row items-center q-gutter-sm">
            <q-icon :name="sportIcon" size="20px" color="primary" />
            <span class="text-h6 text-white">{{ sportLabel }}</span>
            <MatchStatusBadge :status="match.status" />
          </div>
          <div class="text-caption text-grey-5 q-mt-xs">{{ formattedDate }}</div>
        </div>
        <q-space />
        <q-btn
          v-if="isOwner"
          flat
          round
          icon="delete"
          color="negative"
          @click="confirmDelete = true"
        />
      </div>

      <div class="row q-gutter-md">
        <div class="col-12 col-md-7">
          <q-card flat class="details-card q-pa-md q-mb-md">
            <div class="text-subtitle2 text-grey-4 q-mb-sm">Detalhes</div>
            <q-list dense>
              <q-item v-if="match.locationId">
                <q-item-section avatar>
                  <q-icon name="place" color="grey-6" />
                </q-item-section>
                <q-item-section class="text-grey-3">{{ match.locationId }}</q-item-section>
              </q-item>
              <q-item>
                <q-item-section avatar>
                  <q-icon name="group" color="grey-6" />
                </q-item-section>
                <q-item-section class="text-grey-3">
                  Máx. {{ match.maxPlayers }} jogadores
                </q-item-section>
              </q-item>
              <q-item>
                <q-item-section avatar>
                  <q-icon
                    :name="match.visibility === 'PUBLIC' ? 'public' : 'lock'"
                    color="grey-6"
                  />
                </q-item-section>
                <q-item-section class="text-grey-3">
                  {{ match.visibility === 'PUBLIC' ? 'Partida pública' : 'Partida privada' }}
                </q-item-section>
              </q-item>
            </q-list>
          </q-card>
        </div>

        <div class="col-12 col-md-4">
          <q-card flat class="details-card q-pa-md">
            <MatchPlayersList :members="members" :max-players="match.maxPlayers" />
          </q-card>
        </div>
      </div>
    </template>

    <div v-else class="text-center q-mt-xl text-grey-5">
      <q-icon name="error_outline" size="48px" />
      <p>Partida não encontrada</p>
      <q-btn flat color="primary" label="Voltar" :to="{ name: 'app.matches' }" />
    </div>

    <q-dialog v-model="confirmDelete">
      <q-card class="confirm-dialog">
        <q-card-section>
          <div class="text-h6 text-white">Excluir partida?</div>
          <p class="text-grey-4 q-mt-sm">Esta ação não pode ser desfeita.</p>
        </q-card-section>
        <q-card-actions align="right">
          <q-btn flat label="Cancelar" color="grey-5" v-close-popup no-caps />
          <q-btn
            label="Excluir"
            color="negative"
            unelevated
            no-caps
            :loading="deleting"
            @click="onDelete"
          />
        </q-card-actions>
      </q-card>
    </q-dialog>
  </q-page>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { matchStore } from 'src/modules/match/store/matchStore';
import { SPORT_ICON, SPORT_LABEL } from 'src/modules/match/types/match.ui.types';
import MatchStatusBadge from 'src/modules/match/components/MatchStatusBadge.vue';
import MatchPlayersList from 'src/modules/match/components/MatchPlayersList.vue';

export default defineComponent({
  name: 'MatchDetailsPage',

  components: { MatchStatusBadge, MatchPlayersList },

  data() {
    return {
      confirmDelete: false,
      deleting: false,
    };
  },

  computed: {
    match() {
      return matchStore.currentMatch;
    },
    members() {
      return matchStore.members;
    },
    loading() {
      return matchStore.loading;
    },
    isOwner() {
      return matchStore.isOwner;
    },
    sportIcon(): string {
      return this.match ? SPORT_ICON[this.match.sport] : 'sports';
    },
    sportLabel(): string {
      return this.match ? SPORT_LABEL[this.match.sport] : '';
    },
    formattedDate(): string {
      if (!this.match) return '';
      const d = new Date(this.match.date);
      return d.toLocaleString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    },
  },

  async created() {
    const id = this.$route.params.id as string;
    await matchStore.fetchMatch(id);
    await matchStore.fetchMembers(id);
  },

  methods: {
    async onDelete() {
      if (!this.match) return;
      this.deleting = true;
      try {
        await matchStore.deleteMatch(this.match.id);
        await this.$router.push({ name: 'app.matches' });
      } finally {
        this.deleting = false;
        this.confirmDelete = false;
      }
    },
  },
});
</script>

<style scoped>
.match-details-page {
  background: #313338;
  min-height: 100vh;
}

.details-card {
  background: #2b2d31;
  border-radius: 8px;
}

.confirm-dialog {
  background: #2b2d31;
  min-width: 320px;
}
</style>
