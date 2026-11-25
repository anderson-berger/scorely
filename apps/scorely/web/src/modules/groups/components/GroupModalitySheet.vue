<script lang="ts">
import type { Group, GroupModality } from '@scorely/contracts';
import BottomSheet from '@scorely/web/src/components/BottomSheet.vue';
import { errorMessage } from '@scorely/web/src/i18n/errors';
import { isVersionConflict } from '@scorely/web/src/lib/http';
import { groupsApi } from '@scorely/web/src/modules/groups/groups.api';
import { defineComponent, type PropType } from 'vue';

/** GRV-53: o painel "Modalidade", com as três opções e a linha explicando o que ela muda (GRV-52). */
export default defineComponent({
  name: 'GroupModalitySheet',

  components: { BottomSheet },

  props: {
    modelValue: { type: Boolean, required: true },
    group: { type: Object as PropType<Group>, required: true },
  },

  emits: {
    'update:modelValue': (_open: boolean) => true,
    /** O grupo como ficou (ou relido, depois de um conflito de versão). */
    saved: (_group: Group) => true,
  },

  data() {
    return {
      modality: this.group.modality as GroupModality,
      modalities: ['male', 'female', 'mixed'] as GroupModality[],
      saving: false,
    };
  },

  watch: {
    modelValue(open: boolean) {
      if (open) this.modality = this.group.modality;
    },
  },

  methods: {
    close() {
      this.$emit('update:modelValue', false);
    },

    async save() {
      if (this.modality === this.group.modality) return this.close();
      this.saving = true;
      try {
        const group = await groupsApi.setModality(this.group.id, {
          modality: this.modality,
          expectedVersion: this.group.version,
        });
        this.$q.notify({ type: 'positive', message: this.$t('groups.modality.saved') });
        this.$emit('saved', group);
        this.close();
      } catch (err) {
        if (isVersionConflict(err)) {
          // ADR 0016: o grupo mudou desde a leitura: relê, fecha o painel e avisa.
          this.$q.notify({ type: 'warning', message: this.$t('groups.modality.conflict') });
          this.close();
          this.$emit('saved', await groupsApi.get(this.group.id));
        } else this.$q.notify({ type: 'negative', message: errorMessage(err) });
      } finally {
        this.saving = false;
      }
    },
  },
});
</script>

<template>
  <BottomSheet
    :model-value="modelValue"
    :title="$t('groups.modality.title')"
    :persistent="saving"
    @update:model-value="$emit('update:modelValue', $event)"
  >
    <div class="sc-caption hint">{{ $t('groups.modality.hint') }}</div>
    <q-list class="options">
      <q-item v-for="m in modalities" :key="m" v-ripple tag="label" class="option">
        <q-item-section avatar>
          <q-radio v-model="modality" :val="m" :disable="saving" />
        </q-item-section>
        <q-item-section>
          <q-item-label class="name">{{ $t(`groups.modality.${m}`) }}</q-item-label>
        </q-item-section>
      </q-item>
    </q-list>
    <div class="footer">
      <q-btn flat no-caps :label="$t('groups.cancel')" :disable="saving" @click="close" />
      <q-btn
        color="primary"
        unelevated
        no-caps
        :label="$t('groups.modality.save')"
        :loading="saving"
        @click="save"
      />
    </div>
  </BottomSheet>
</template>

<style scoped>
.hint {
  margin-top: 4px;
}

.options {
  padding: 8px 0;
}

.option {
  padding-left: 0;
  padding-right: 0;
}

.name {
  font-weight: 700;
}

.footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 8px;
}
</style>
