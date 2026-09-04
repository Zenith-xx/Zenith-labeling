<script setup lang="ts">
import type { Component } from 'vue';
import { Download, FileText, FolderOpen } from 'lucide-vue-next';
import './YoloTransferModal.css';

export interface TransferStep {
  title: string;
  description?: string;
  buttonText: string;
  buttonIcon?: Component;
  status?: string | null;
  loading?: boolean;
  disabled?: boolean;
  primary?: boolean;
  onAction: () => void;
}

withDefaults(
  defineProps<{
    steps: TransferStep[];
    showSampleDownload?: boolean;
    sampleDownloadLabel?: string;
    onSampleDownload?: () => void;
  }>(),
  {
    sampleDownloadLabel: '下载导入示例（含注释说明）',
  }
);
</script>

<template>
  <div class="transfer-steps">
    <div v-for="(step, index) in steps" :key="index" class="transfer-step">
      <div class="transfer-step-title">{{ index + 1 }}. {{ step.title }}</div>
      <div v-if="step.description" class="transfer-step-desc">{{ step.description }}</div>
      <a-button
        :type="step.primary ? 'primary' : 'default'"
        :loading="step.loading"
        :disabled="step.disabled"
        block
        @click="step.onAction"
      >
        <template #icon>
          <component
            :is="step.buttonIcon ?? (step.primary ? FolderOpen : FileText)"
            :size="14"
          />
        </template>
        {{ step.buttonText }}
      </a-button>
      <div v-if="step.status" class="transfer-step-status">{{ step.status }}</div>
    </div>

    <div v-if="showSampleDownload && onSampleDownload" class="transfer-sample-download">
      <button type="button" class="transfer-sample-link" @click="onSampleDownload">
        <Download :size="14" />
        {{ sampleDownloadLabel }}
      </button>
    </div>
  </div>
</template>
