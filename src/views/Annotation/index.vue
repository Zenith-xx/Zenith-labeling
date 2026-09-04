<script setup lang="ts">
import { message } from 'ant-design-vue';
import TopBar from '@/components/TopBar/index.vue';
import Toolbar from '@/components/Toolbar/index.vue';
import CanvasArea from '@/components/Canvas/index.vue';
import LabelManager from '@/components/LabelManager/index.vue';
import ObjectPanel from '@/components/ObjectPanel/index.vue';
import FilePanel from '@/components/FilePanel/index.vue';
import StatusBar from '@/components/StatusBar/index.vue';
import ImportProgressModal from '@/components/ImportProgressModal/index.vue';
import RestoreProjectModal from '@/components/RestoreProjectModal/index.vue';
import AiPanel from '@/components/AiPanel/index.vue';
import ModelCenter from '@/components/ModelCenter/ModelCenter.vue';
import AiTaskProgress from '@/components/AiTask/AiTaskProgress.vue';
import { useAiTaskStore } from '@/features/aiTask';
import { useImageNavigation } from '@/composables/useImageNavigation';
import { useStartupRestore } from '@/composables/useStartupRestore';
import { pickProjectFolder } from '@/importer';
import {
  bindRestoredProjectFolder,
  tryRebindStoredFolder,
} from '@/storage/projectRestore';
import { useProjectStore } from '@/store/useProjectStore';
import { isUserCancel } from '@/utils/filePicker';
import './index.css';

useImageNavigation();

const { offer, restoring, acceptRestore, dismissRestore } = useStartupRestore();
const aiTaskStore = useAiTaskStore();
const projectStore = useProjectStore();

async function bindPickedFolder(): Promise<void> {
  const picked = await pickProjectFolder();
  const result = await bindRestoredProjectFolder(picked);
  message.success(
    `已关联 ${result.matched} 张图片` +
      (result.added > 0 ? `，新增 ${result.added} 张` : '') +
      (result.missing > 0 ? `（${result.missing} 张待匹配）` : '')
  );
}

async function pickFolderAfterRestore(): Promise<void> {
  try {
    const projectId = projectStore.projectId;
    if (projectId) {
      const rebound = await tryRebindStoredFolder(projectId);
      if (rebound) {
        message.success(
          `已自动关联 ${rebound.matched} 张图片` +
            (rebound.added > 0 ? `，新增 ${rebound.added} 张` : '') +
            (rebound.missing > 0 ? `（${rebound.missing} 张待匹配）` : '')
        );
        return;
      }
    }
    await bindPickedFolder();
  } catch (err) {
    if (isUserCancel(err)) {
      message.info('请选择图片文件夹以显示图像');
      return;
    }
    message.error(err instanceof Error ? err.message : '关联图片文件夹失败');
  }
}

async function handleRestore(): Promise<void> {
  const summary = await acceptRestore();
  if (!summary) return;
  message.success(
    `已恢复「${summary.projectName}」：${summary.labelCount} 个标签、${summary.annotationCount} 条标注`
  );

  try {
    const rebound = await tryRebindStoredFolder(summary.projectId);
    if (rebound) {
      message.success(
        `已自动关联 ${rebound.matched} 张图片` +
          (rebound.added > 0 ? `，新增 ${rebound.added} 张` : '') +
          (rebound.missing > 0 ? `（${rebound.missing} 张待匹配）` : '')
      );
      return;
    }
    await bindPickedFolder();
  } catch (err) {
    if (isUserCancel(err)) {
      message.info('请选择图片文件夹以显示图像');
      return;
    }
    message.error(err instanceof Error ? err.message : '关联图片文件夹失败');
  }
}
</script>

<template>
  <div class="annotation-page">
    <TopBar />
    <div class="annotation-body">
      <Toolbar :on-pick-folder-after-restore="pickFolderAfterRestore" />
      <AiPanel />
      <CanvasArea />
      <div class="right-panel">
        <LabelManager />
        <ObjectPanel />
        <FilePanel />
      </div>
    </div>
    <StatusBar />
    <ImportProgressModal />
    <RestoreProjectModal
      :offer="offer"
      :restoring="restoring"
      @restore="handleRestore"
      @dismiss="dismissRestore"
    />
    <AiTaskProgress
      :open="aiTaskStore.progressOpen"
      @close="aiTaskStore.setProgressOpen(false)"
    />
    <ModelCenter />
  </div>
</template>
