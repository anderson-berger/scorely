<template>
  <q-card dark class="match-card">
    <div class="card-banner" :style="{ backgroundImage: `url(${sportImage})` }">
      <div class="banner-overlay" />
      <q-card-section class="match-header">
        <q-badge :color="statusColor" :label="statusLabel" class="status-badge" />
        <q-badge outline color="white" :label="sportLabel" class="sport-badge" />
      </q-card-section>

      <q-card-section class="match-teams">
        <!-- Time A -->
        <div class="team-side">
          <q-avatar size="40px" class="team-avatar">
            <img v-if="match.teamA.logo" :src="match.teamA.logo" class="avatar-img" />
            <span v-else class="team-initials text-uppercase text-weight-bold">
              {{ match.teamA.name.substring(0, 2) }}
            </span>
          </q-avatar>
          <span class="team-name text-weight-medium">{{ match.teamA.name }}</span>
        </div>

        <!-- Placar / VS -->
        <div class="score-section">
          <template v-if="match.status === 'finished' || match.status === 'in_progress'">
            <span class="score text-weight-bold">{{ match.scoreA }}</span>
            <span class="score-divider">x</span>
            <span class="score text-weight-bold">{{ match.scoreB }}</span>
          </template>
          <span v-else class="vs-label text-weight-bold">VS</span>
        </div>

        <!-- Time B -->
        <div class="team-side">
          <q-avatar size="40px" class="team-avatar">
            <img v-if="match.teamB.logo" :src="match.teamB.logo" class="avatar-img" />
            <span v-else class="team-initials text-uppercase text-weight-bold">
              {{ match.teamB.name.substring(0, 2) }}
            </span>
          </q-avatar>
          <span class="team-name text-weight-medium">{{ match.teamB.name }}</span>
        </div>
      </q-card-section>
    </div>

    <q-card-section class="match-footer">
      <div class="footer-row">
        <div class="footer-info">
          <q-icon name="event" size="14px" color="grey-5" />
          <span class="text-grey-4 text-caption">{{ match.date }}</span>
        </div>
        <div class="footer-info">
          <q-icon name="person" size="14px" color="grey-5" />
          <span class="text-grey-4 text-caption">{{ match.admin }}</span>
        </div>
      </div>
      <div class="footer-info q-mt-xs">
        <q-icon name="location_on" size="14px" color="grey-5" />
        <span class="text-grey-4 text-caption">{{ match.location }}</span>
      </div>
    </q-card-section>
  </q-card>
</template>

<script lang="ts">
import { defineComponent, type PropType } from 'vue';

export type Sport = 'futsal' | 'volleyball' | 'basketball';

export interface Match {
  id: string;
  sport: Sport;
  status: 'scheduled' | 'in_progress' | 'finished' | 'cancelled';
  role: 'creator' | 'member';
  date: string;
  location: string;
  admin: string;
  teamA: { name: string; logo?: string };
  teamB: { name: string; logo?: string };
  scoreA: number;
  scoreB: number;
}

const statusMap: Record<Match['status'], { label: string; color: string }> = {
  scheduled: { label: 'Agendada', color: 'blue-grey' },
  in_progress: { label: 'Em andamento', color: 'green' },
  finished: { label: 'Finalizada', color: 'grey' },
  cancelled: { label: 'Cancelada', color: 'red-4' },
};

const sportMap: Record<Sport, { label: string; image: string }> = {
  futsal: {
    label: 'Futsal',
    image: 'https://t3.ftcdn.net/jpg/08/62/88/82/240_F_862888203_MceL5GNg4HX3TWwaLe54c2tf2QCcSh1q.jpg',
  },
  volleyball: {
    label: 'Vôlei',
    image: 'https://t4.ftcdn.net/jpg/04/22/84/11/240_F_422841157_AIIqM4WW73kF4kPEr0Qx58RqFRa67Mv8.jpg',
  },
  basketball: {
    label: 'Basquete',
    image: 'https://t4.ftcdn.net/jpg/00/09/31/13/240_F_9311366_2759IXJGd6pCZLPpHchUvDNi7tOIRd8J.jpg',
  },
};

export default defineComponent({
  name: 'MatchCard',

  props: {
    match: {
      type: Object as PropType<Match>,
      required: true,
    },
  },

  computed: {
    statusLabel(): string {
      return statusMap[this.match.status].label;
    },

    statusColor(): string {
      return statusMap[this.match.status].color;
    },

    sportLabel(): string {
      return sportMap[this.match.sport].label;
    },

    sportImage(): string {
      return sportMap[this.match.sport].image;
    },
  },
});
</script>

<style scoped>
.match-card {
  background: #2b2d31;
  border-radius: 8px;
  overflow: hidden;
}

.card-banner {
  position: relative;
  background-size: cover;
  background-position: center;
}

.banner-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(0, 0, 0, 0.75) 0%,
    rgba(0, 0, 0, 0.65) 40%,
    rgba(0, 0, 0, 0.8) 100%
  );
}

.match-header {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
}

.match-teams {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 24px 16px;
  gap: 16px;
}

.team-side {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.team-avatar {
  background: rgba(0, 0, 0, 0.4);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 12px;
}

.avatar-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.team-initials {
  font-size: 14px;
  color: #fff;
}

.team-name {
  color: #fff;
  font-size: 0.85rem;
  text-align: center;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
}

.score-section {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.score {
  font-size: 1.5rem;
  color: #fff;
  text-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
}

.score-divider {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
}

.vs-label {
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.7);
}

.match-footer {
  padding: 10px 16px;
}

.footer-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.footer-info {
  display: flex;
  align-items: center;
  gap: 4px;
}

.status-badge {
  font-size: 10px;
}

.sport-badge {
  font-size: 10px;
}
</style>
