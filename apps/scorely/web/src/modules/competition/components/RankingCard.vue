<script lang="ts">
import type { Gender, Group, Ranking, RankingRow, Season } from '@scorely/contracts';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime, localDateIn } from '@scorely/web/src/lib/datetime';
import { useAuthStore } from '@scorely/web/src/modules/auth/auth.store';
import {
  currentSeason,
  podiumOf,
  positionText,
  rankingLine,
  seasonStatusText,
  seasonTitle,
  shareText,
  type Text,
} from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import PersonHistorySheet from '@scorely/web/src/modules/competition/components/PersonHistorySheet.vue';
import { podiumCardImage, sharePodium } from '@scorely/web/src/modules/competition/podiumCard';
import { defineComponent, type PropType } from 'vue';

/** O recorte na tela: geral ou pelo gênero do perfil (CMP-25). */
type Cut = 'all' | Gender;

/**
 * O ranking na aba Competição (CMP-28, 35): o card da temporada no topo, a escolha Temporada / Geral, o recorte e uma
 * linha por membro, com a marca "você". Embaixo, as temporadas anteriores com o pódio; tocar numa abre o ranking final
 * dela. Tocar numa pessoa abre o histórico (CMP-27).
 */
export default defineComponent({
  name: 'RankingCard',

  components: { PersonHistorySheet },

  props: {
    group: { type: Object as PropType<Group>, required: true },
  },

  setup() {
    return { auth: useAuthStore() };
  },

  data() {
    return {
      cut: 'all' as Cut,
      seasons: [] as Season[],
      /** A temporada mostrada; `undefined` = o ranking do grupo (Geral). */
      selected: undefined as string | undefined,
      ranking: undefined as Ranking | undefined,
      loadError: '',
      person: undefined as RankingRow | undefined,
      personOpen: false,
      /** A temporada cujo card está sendo montado (CMP-40). */
      sharing: undefined as string | undefined,
    };
  },

  computed: {
    cuts(): { label: string; value: Cut }[] {
      return [
        { label: this.$t('competition.ranking.all'), value: 'all' },
        { label: this.$t('competition.ranking.male'), value: 'M' },
        { label: this.$t('competition.ranking.female'), value: 'F' },
      ];
    },

    current(): Season | undefined {
      return currentSeason(this.seasons);
    },

    scheduled(): Season | undefined {
      return this.seasons.find((s) => s.state === 'scheduled');
    },

    previous(): Season[] {
      return this.seasons.filter((s) => s.state === 'closed');
    },

    /** A escolha Temporada / Geral, só com uma temporada valendo. */
    choices(): { label: string; value: string }[] {
      if (!this.current) return [];
      return [
        { label: this.$t('competition.seasons.choice.season'), value: this.current.id },
        { label: this.$t('competition.seasons.choice.all'), value: 'all' },
      ];
    },

    choice: {
      get(): string {
        return this.selected ?? 'all';
      },
      set(value: string) {
        this.selected = value === 'all' ? undefined : value;
      },
    },

    /** O ranking final de uma temporada anterior está aberto. */
    viewingPrevious(): Season | undefined {
      return this.previous.find((s) => s.id === this.selected);
    },

    today(): string {
      return localDateIn(this.group.timeZone);
    },
  },

  watch: {
    'group.id': { immediate: true, handler: 'loadAll' },
    cut: 'load',
    selected: 'load',
  },

  methods: {
    text(t: Text): string {
      return this.$t(t.key, t.params ?? {});
    },

    title(season: Season): string {
      return this.text(seasonTitle(season));
    },

    status(season: Season): string {
      const date = (local: string) => formatDateTime(`${local}T12:00:00.000Z`, 'date', { timeZone: 'UTC' });
      return this.text(seasonStatusText(season, this.today, date, (iso) => formatDateTime(iso)));
    },

    /** CMP-36: "Mais presente: Ana · Maior sequência: Caio". */
    highlights(season: Season): string {
      return (season.highlights ?? [])
        .map(
          (h) =>
            `${this.$t(`competition.trophies.kind.${h.kind}`)}: ${h.rows.map((r) => r.name ?? this.$t('groups.unnamed')).join(', ')}`,
        )
        .join(' · ');
    },

    /** CMP-40: monta o card do pódio e compartilha (ou baixa e copia o texto). */
    async share(season: Season) {
      this.sharing = season.id;
      try {
        const text = shareText(season, this.group.name, this.text);
        const lines = text.split('\n').slice(1);
        const image = await podiumCardImage({ group: this.group.name, season: this.title(season), lines });
        const done = await sharePodium(image, 'podio.png', text);
        this.$q.notify({ type: 'positive', message: this.$t(`competition.share.${done}`) });
      } catch (err) {
        // Quem cancela o compartilhar do sistema não vê erro.
        if (!(err instanceof DOMException && err.name === 'AbortError')) {
          this.$q.notify({ type: 'negative', message: errorMessage(err) });
        }
      } finally {
        this.sharing = undefined;
      }
    },

    podium(season: Season): string {
      return podiumOf(season)
        .map((r) => `${this.text(positionText(r))} ${r.name ?? this.$t('groups.unnamed')}`)
        .join(' · ');
    },

    position(row: RankingRow): string {
      return this.text(positionText(row));
    },

    line(row: RankingRow): string {
      return rankingLine(row).map(this.text).join(' · ');
    },

    isMe(row: RankingRow): boolean {
      return row.userId === this.auth.user?.id;
    },

    /** As temporadas e, por padrão, o ranking da que vale agora (CMP-35). */
    async loadAll() {
      try {
        this.seasons = await competitionApi.seasons(this.group.id);
      } catch {
        // Sem a lista, o ranking do grupo continua aparecendo.
        this.seasons = [];
      }
      if (this.current && this.selected === undefined) this.selected = this.current.id;
      else await this.load();
    },

    async load() {
      this.loadError = '';
      try {
        this.ranking = await competitionApi.ranking(
          this.group.id,
          this.cut === 'all' ? undefined : this.cut,
          this.selected,
        );
      } catch (err) {
        this.loadError = errorMessage(err);
      }
    },

    openPrevious(season: Season) {
      this.selected = season.id;
    },

    open(row: RankingRow) {
      this.person = row;
      this.personOpen = true;
    },
  },
});
</script>

<template>
  <section>
    <div class="sc-card season" role="status">
      <q-icon name="emoji_events" size="22px" class="season-icon" aria-hidden="true" />
      <div v-if="current">
        <div class="sc-display season-name">{{ title(current) }}</div>
        <div class="sc-caption">{{ status(current) }}</div>
      </div>
      <div v-else>
        <div class="sc-display season-name">{{ $t('competition.seasons.none') }}</div>
        <div class="sc-caption">
          {{ scheduled ? `${title(scheduled)} · ${status(scheduled)}` : $t('competition.seasons.noneHint') }}
        </div>
      </div>
    </div>

    <div class="head">
      <h2 class="sc-section">
        {{
          viewingPrevious
            ? $t('competition.seasons.final', { name: title(viewingPrevious) })
            : $t('competition.ranking.title')
        }}
      </h2>
      <q-btn-toggle v-model="cut" no-caps unelevated dense toggle-color="primary" :options="cuts" />
    </div>
    <q-btn-toggle
      v-if="choices.length > 0 && !viewingPrevious"
      v-model="choice"
      no-caps
      unelevated
      dense
      toggle-color="primary"
      class="choice"
      :options="choices"
    />
    <q-btn
      v-if="viewingPrevious"
      flat
      no-caps
      dense
      icon="arrow_back"
      class="choice"
      :label="$t('competition.seasons.back')"
      @click="selected = current?.id"
    />

    <div v-if="loadError" class="sc-card sc-caption notice">{{ loadError }}</div>
    <div v-else-if="!ranking" class="state"><q-spinner color="primary" size="md" /></div>
    <template v-else>
      <div v-if="ranking.games === 0" class="sc-caption hint">{{ $t('competition.ranking.empty') }}</div>
      <div v-if="ranking.rows.length === 0" class="sc-card sc-caption notice">
        {{ $t('competition.ranking.noRows') }}
      </div>
      <div v-else class="sc-card list">
        <button
          v-for="row in ranking.rows"
          :key="row.userId"
          type="button"
          class="row"
          :class="{ 'row--me': isMe(row) }"
          @click="open(row)"
        >
          <span class="sc-number pos">{{ position(row) }}</span>
          <span class="who">
            <span class="name">
              {{ row.name ?? $t('groups.unnamed') }}
              <span v-if="isMe(row)" class="sc-caption me">{{ $t('competition.ranking.you') }}</span>
            </span>
            <span class="sc-caption">{{ line(row) }}</span>
          </span>
          <span class="sc-number points">{{ $t('competition.ranking.points', { n: row.points }) }}</span>
        </button>
      </div>
    </template>

    <template v-if="previous.length > 0">
      <h3 class="sc-section sub">{{ $t('competition.seasons.previous') }}</h3>
      <div class="sc-card list">
        <div v-for="s in previous" :key="s.id" class="prev">
          <button type="button" class="row" @click="openPrevious(s)">
            <span class="who">
              <span class="name">{{ title(s) }}</span>
              <span class="sc-caption">{{ status(s) }}</span>
              <span v-if="podium(s)" class="sc-caption">{{ $t('competition.seasons.podium') }}: {{ podium(s) }}</span>
              <span v-if="highlights(s)" class="sc-caption">
                {{ $t('competition.share.highlights') }}: {{ highlights(s) }}
              </span>
            </span>
            <q-icon name="chevron_right" size="20px" aria-hidden="true" />
          </button>
          <q-btn
            v-if="podium(s)"
            flat
            round
            dense
            icon="share"
            :aria-label="$t('competition.share.button')"
            :loading="sharing === s.id"
            @click="share(s)"
          />
        </div>
      </div>
    </template>

    <PersonHistorySheet
      v-if="person"
      v-model="personOpen"
      :group-id="group.id"
      :user-id="person.userId"
      :name="person.name ?? $t('groups.unnamed')"
    />
  </section>
</template>

<style scoped>
.season {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  margin-bottom: 16px;
}

.season-icon {
  color: var(--sc-accent);
}

.season-name {
  font-size: 18px;
}

.choice {
  margin-bottom: 10px;
}

.sub {
  margin: 18px 0 8px;
}

.prev {
  display: flex;
  align-items: center;
  gap: 4px;
  border-bottom: 1px solid var(--sc-line);
}

.prev:last-child {
  border-bottom: 0;
}

.prev .row {
  border-bottom: 0;
}

.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

.notice {
  padding: 18px 14px;
  text-align: center;
  border-style: dashed;
  border-color: var(--sc-line-strong);
}

.state {
  padding: 18px 0;
  text-align: center;
}

.hint {
  margin-bottom: 8px;
}

.list {
  padding: 0 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: 56px;
  padding: 8px 0;
  border: 0;
  border-bottom: 1px solid var(--sc-line);
  background: transparent;
  color: var(--sc-text);
  font-family: inherit;
  text-align: left;
  cursor: pointer;
}

.row:last-child {
  border-bottom: 0;
}

.row--me .name {
  color: var(--sc-accent);
}

.pos {
  width: 40px;
  flex-shrink: 0;
  font-size: 22px;
}

.who {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.name {
  font-size: 15px;
}

.me {
  margin-left: 6px;
}

.points {
  flex-shrink: 0;
  font-size: 20px;
}
</style>
