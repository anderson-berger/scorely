<script lang="ts">
import { COMPETITION_TRIAL_DAYS, type Competition, type Group } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { formatDateTime } from '@scorely/web/src/lib/datetime';
import { pointsSummary, statusText } from '@scorely/web/src/modules/competition/competition';
import { competitionApi } from '@scorely/web/src/modules/competition/competition.api';
import CompetitionRulesSheet from '@scorely/web/src/modules/competition/components/CompetitionRulesSheet.vue';
import SettingsRow from '@scorely/web/src/modules/groups/components/SettingsRow.vue';
import {
  type GroupAccess,
  NO_ACCESS,
  onPermissionError,
  permissionLostInject,
} from '@scorely/web/src/modules/groups/permissions';
import { defineComponent, type PropType } from 'vue';

/**
 * Linha "Competição" dos Ajustes (CMP-10, GRP-29). Ao tocar:
 * - desativada (só o dono vê a linha): o painel que explica o módulo, com "Começar teste" e confirmação (CMP-02);
 * - ativa: o painel do regulamento (CMP-07);
 * - vencida: o painel que explica que o plano é liberado pela equipe (CMP-03, 04).
 */
export default defineComponent({
  name: 'CompetitionSettingsRow',

  components: { BottomSheet, CompetitionRulesSheet, SettingsRow },

  inject: permissionLostInject,

  props: {
    group: { type: Object as PropType<Group>, required: true },
    competition: { type: Object as PropType<Competition>, required: true },
    access: { type: Object as PropType<GroupAccess>, default: () => NO_ACCESS },
  },

  emits: {
    changed: (_c: Competition) => true,
    reload: () => true,
  },

  data() {
    return {
      infoOpen: false,
      rulesOpen: false,
      starting: false,
    };
  },

  computed: {
    /** "Teste até 14/12 · V 3 · E 2 · D 1 · F −2". */
    summary(): string {
      const t = statusText(this.competition, (iso) => formatDateTime(iso, 'date'));
      const status = this.$t(t.key, t.params ?? {});
      const rules = this.competition.status === 'active' ? this.competition.rules : undefined;
      if (!rules) return status;
      const points = pointsSummary(rules.points).map((p) => `${this.$t(p.key)} ${p.value}`);
      return [status, ...points].join(' · ');
    },

    trialDays(): number {
      return COMPETITION_TRIAL_DAYS;
    },
  },

  methods: {
    open() {
      if (this.competition.status === 'active') this.rulesOpen = true;
      else this.infoOpen = true;
    },

    ask(message: string): Promise<boolean> {
      return new Promise((resolve) => {
        this.$q
          .dialog({
            message,
            cancel: { label: this.$t('groups.no'), flat: true },
            ok: { label: this.$t('groups.yes'), color: 'primary' },
            persistent: true,
          })
          .onOk(() => resolve(true))
          .onCancel(() => resolve(false));
      });
    },

    /** CMP-02, 10: pede confirmação; depois, a página mostra a aba Competição. */
    async startTrial() {
      if (!(await this.ask(this.$t('competition.trial.confirm', { days: this.trialDays })))) return;
      this.starting = true;
      try {
        const started = await competitionApi.startTrial(this.group.id);
        this.infoOpen = false;
        this.$q.notify({ type: 'positive', message: this.$t('competition.trial.started') });
        this.$emit('changed', started);
      } catch (err) {
        if (await onPermissionError(err, this.permissionLost)) {
          this.infoOpen = false;
          return;
        }
        this.$q.notify({ type: 'negative', message: errorMessage(err) });
        this.infoOpen = false;
        this.$emit('reload');
      } finally {
        this.starting = false;
      }
    },
  },
});
</script>

<template>
  <section>
    <SettingsRow icon="emoji_events" :title="$t('competition.title')" :summary="summary" @open="open" />

    <BottomSheet v-model="infoOpen" :title="$t('competition.title')" :persistent="starting">
      <template v-if="competition.status === 'expired'">
        <div class="sc-caption q-mt-xs">{{ $t('competition.expired.hint') }}</div>
        <div class="actions actions--one">
          <q-btn flat no-caps class="sc-btn-outline" :label="$t('competition.close')" @click="infoOpen = false" />
        </div>
      </template>
      <template v-else>
        <div class="intro q-mt-xs">{{ $t('competition.trial.intro') }}</div>
        <div class="sc-caption q-mt-sm">{{ $t('competition.trial.hint') }}</div>
        <div class="actions">
          <q-btn flat no-caps class="sc-btn-outline" :label="$t('groups.cancel')" :disable="starting" @click="infoOpen = false" />
          <q-btn
            color="primary"
            unelevated
            no-caps
            class="sc-btn-main"
            :label="$t('competition.trial.start', { days: trialDays })"
            :loading="starting"
            @click="startTrial"
          />
        </div>
      </template>
    </BottomSheet>

    <CompetitionRulesSheet
      v-if="competition.status === 'active'"
      v-model="rulesOpen"
      :group-id="group.id"
      :competition="competition"
      @saved="$emit('changed', $event)"
      @reload="$emit('reload')"
    />
  </section>
</template>

<style scoped>
.intro {
  font-size: 15px;
}

.actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}

.actions--one {
  grid-template-columns: 1fr;
}
</style>
