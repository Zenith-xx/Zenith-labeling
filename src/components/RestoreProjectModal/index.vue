<script setup lang="ts">
import { Button, Modal } from 'ant-design-vue';
import type { RestoreOffer } from '@/composables/useStartupRestore';
import './index.css';

defineProps<{
  offer: RestoreOffer | null;
  restoring: boolean;
}>();

const emit = defineEmits<{
  restore: [];
  dismiss: [];
}>();

function formatRestoreTime(timestamp: number): string {
  try {
    return new Date(timestamp).toLocaleString();
  } catch {
    return '';
  }
}
</script>

<template>
  <Modal
    title="恢复上次项目"
    :open="offer != null"
    :width="420"
    destroy-on-close
    class="restore-project-modal"
    :mask-closable="!restoring"
    :closable="!restoring"
    @cancel="emit('dismiss')"
  >
    <div v-if="offer" class="restore-project-body">
      <p class="restore-project-lead">
        检测到本地已保存的项目快照，可恢复标签与标注数据。
      </p>
      <dl class="restore-project-meta">
        <div class="restore-project-meta-row">
          <dt>项目</dt>
          <dd>{{ offer.name }}</dd>
        </div>
        <div class="restore-project-meta-row">
          <dt>保存时间</dt>
          <dd>{{ formatRestoreTime(offer.updatedAt) }}</dd>
        </div>
        <div class="restore-project-meta-row">
          <dt>图片</dt>
          <dd>{{ offer.imageCount }} 张</dd>
        </div>
        <div class="restore-project-meta-row">
          <dt>标签 / 标注</dt>
          <dd>{{ offer.labelCount }} 个标签，{{ offer.annotationCount }} 条标注</dd>
        </div>
      </dl>
    </div>

    <template #footer>
      <Button :disabled="restoring" @click="emit('dismiss')">暂不恢复</Button>
      <Button type="primary" :loading="restoring" @click="emit('restore')">
        恢复项目
      </Button>
    </template>
  </Modal>
</template>
