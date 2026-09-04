<script setup lang="ts">
import { reactive, watch } from 'vue';
import { Button, Form, Input, InputNumber, Modal, message } from 'ant-design-vue';
import { getDefaultLabelingServerUrl } from '@/config/labelingServer';
import { useAiStore } from '@/store/useAiStore';
import { useModelStore } from '@/store/useModelStore';
import './index.css';

const DEFAULT_SERVER_URL = getDefaultLabelingServerUrl();

const props = defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

const aiStore = useAiStore();
const modelStore = useModelStore();

const formModel = reactive({
  serverUrl: '',
  timeoutSec: 120,
  apiToken: '',
});

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    formModel.serverUrl = aiStore.serverUrl;
    formModel.timeoutSec = aiStore.timeoutSec;
    formModel.apiToken = aiStore.apiToken;
  }
);

async function handleSaveServer(): Promise<void> {
  const nextUrl = formModel.serverUrl?.trim();
  aiStore.setServerUrl(nextUrl || DEFAULT_SERVER_URL);
  aiStore.setTimeoutSec(formModel.timeoutSec);
  aiStore.setApiToken(formModel.apiToken);
  try {
    await modelStore.refreshModels();
    message.success('服务器设置已保存，模型列表已刷新');
    emit('close');
  } catch (err) {
    message.warning(
      err instanceof Error
        ? `设置已保存，但连接失败：${err.message}`
        : '设置已保存，但无法连接服务器'
    );
  }
}
</script>

<template>
  <Modal
    title="AI 服务设置"
    :open="open"
    :footer="null"
    :width="420"
    destroy-on-close
    class="ai-model-settings-modal"
    @cancel="emit('close')"
  >
    <section class="ai-settings-section">
      <h4 class="ai-settings-title">Labeling-Server</h4>
      <p class="ai-settings-desc">
        默认会自动探测本地 Labeling-Server（<code>/labeling-api</code>、
        <code>127.0.0.1:8100</code>）。也可手动填写地址覆盖自动探测。
      </p>
      <Form layout="vertical" size="small" :model="formModel" @finish="handleSaveServer">
        <Form.Item name="serverUrl" label="服务器地址（可选）">
          <Input v-model:value="formModel.serverUrl" placeholder="留空则自动检测" />
        </Form.Item>
        <Form.Item name="apiToken" label="API Token（可选）">
          <Input.Password
            v-model:value="formModel.apiToken"
            placeholder="与服务器 LABELING_API_TOKEN 一致；也可通过 VITE_LABELING_API_TOKEN 配置"
          />
        </Form.Item>
        <Form.Item
          label="超时（秒）"
          :rules="[{ required: true, message: '请输入超时时间' }]"
        >
          <InputNumber v-model:value="formModel.timeoutSec" :min="10" :max="600" style="width: 100%" />
        </Form.Item>
        <Button type="primary" html-type="submit">保存并刷新</Button>
      </Form>
    </section>
  </Modal>
</template>
