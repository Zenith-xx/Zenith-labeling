<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import {
  Button,
  Checkbox,
  Form,
  Input,
  Modal,
  Popconfirm,
  message,
} from 'ant-design-vue';
import type { FormInstance, Rule } from 'ant-design-vue/es/form';
import { DeleteOutlined, SettingOutlined } from '@ant-design/icons-vue';
import VirtualList from '@/components/VirtualList/index.vue';
import LabelColorPicker from './LabelColorPicker.vue';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import {
  CreateLabelCommand,
  DeleteLabelCommand,
  UpdateLabelCommand,
} from '@/history';
import { getNextLabelColor } from '@/constants/labelColors';
import type { Label } from '@/types';
import { generateId } from '@/utils/id';
import './settings.css';

const SETTINGS_ROW_HEIGHT = 36;

const props = defineProps<{
  open: boolean;
  initialLabelId?: string | null;
}>();

const emit = defineEmits<{
  close: [];
}>();

const annotationStore = useAnnotationStore();
const historyStore = useHistoryStore();

const formRef = ref<FormInstance>();
const selectedIds = ref<Set<string>>(new Set());
const editingId = ref<string | null>(null);

const formModel = reactive({ name: '', description: '' });

const nameRules: Rule[] = [
  { required: true, message: '请输入标签名称' },
  { max: 50, message: '标签名称不超过 50 个字符' },
];

const allSelected = computed(
  () =>
    annotationStore.labels.length > 0 &&
    selectedIds.value.size === annotationStore.labels.length
);

const selectedCount = computed(() => selectedIds.value.size);

const isEditingExisting = computed(() => Boolean(editingId.value));

const saveButtonText = computed(() =>
  isEditingExisting.value ? '保存修改' : '添加标签'
);

function resetForm(): void {
  editingId.value = null;
  formModel.name = '';
  formModel.description = '';
  formRef.value?.resetFields();
}

function loadLabel(label: Label): void {
  editingId.value = label.id;
  formModel.name = label.name;
  formModel.description = label.description ?? '';
}

function loadLabelById(labelId: string | null | undefined): void {
  if (!labelId) {
    resetForm();
    return;
  }
  const label = annotationStore.labels.find((item) => item.id === labelId);
  if (label) {
    loadLabel(label);
    return;
  }
  resetForm();
}

watch(
  () => props.open,
  (open) => {
    if (!open) {
      selectedIds.value = new Set();
      resetForm();
      return;
    }
    loadLabelById(props.initialLabelId);
  }
);

watch(
  () => props.initialLabelId,
  (labelId) => {
    if (!props.open) return;
    loadLabelById(labelId);
  }
);

watch(
  () => annotationStore.labels,
  (labels) => {
    if (selectedIds.value.size > 0) {
      const valid = new Set(labels.map((label) => label.id));
      const next = new Set<string>();
      let changed = false;
      for (const id of selectedIds.value) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      if (changed) selectedIds.value = next;
    }

    if (editingId.value && !labels.some((label) => label.id === editingId.value)) {
      resetForm();
    }
  }
);

function handleToggleAll(): void {
  if (allSelected.value) {
    selectedIds.value = new Set();
  } else {
    selectedIds.value = new Set(annotationStore.labels.map((label) => label.id));
  }
}

function handleToggleOne(id: string, checked: boolean): void {
  const next = new Set(selectedIds.value);
  if (checked) next.add(id);
  else next.delete(id);
  selectedIds.value = next;
}

function handleListNameClick(label: Label): void {
  if (editingId.value === label.id) {
    resetForm();
    return;
  }
  loadLabel(label);
}

function handleModalBlankClick(): void {
  if (!editingId.value) return;
  resetForm();
}

async function handleSave(): Promise<void> {
  try {
    await formRef.value?.validate();
    const name = formModel.name.trim();
    const description = formModel.description.trim() || undefined;
    const targetId = editingId.value;

    if (targetId) {
      const before = annotationStore.labels.find((label) => label.id === targetId);
      if (!before) return;
      const duplicate = annotationStore.labels.some(
        (label) => label.name === name && label.id !== targetId
      );
      if (duplicate) {
        message.warning(`标签「${name}」已存在`);
        return;
      }
      historyStore.executeCommand(
        new UpdateLabelCommand(targetId, before, { name, description })
      );
      editingId.value = targetId;
      message.success(`已更新标签「${name}」`);
      return;
    }

    const exists = annotationStore.labels.some((label) => label.name === name);
    if (exists) {
      message.warning(`标签「${name}」已存在`);
      return;
    }

    const label: Label = {
      id: generateId(),
      name,
      color: getNextLabelColor(annotationStore.labels.length),
      description,
    };
    historyStore.executeCommand(new CreateLabelCommand(label));
    resetForm();
    message.success(`已添加标签「${label.name}」`);
  } catch {
    // validation failed
  }
}

function handleColorChange(label: Label, color: string): void {
  const before = annotationStore.labels.find((item) => item.id === label.id);
  if (!before || before.color === color) return;
  historyStore.executeCommand(
    new UpdateLabelCommand(before.id, before, { color })
  );
  message.success(`已更新「${before.name}」颜色`);
}

function handleDeleteSelected(): void {
  const ids = Array.from(selectedIds.value);
  if (ids.length === 0) return;
  const snapshot = DeleteLabelCommand.capture(ids);
  if (snapshot) {
    historyStore.executeCommand(new DeleteLabelCommand(snapshot));
  }
  if (editingId.value && ids.includes(editingId.value)) {
    resetForm();
  }
  selectedIds.value = new Set();
  message.success(`已删除 ${ids.length} 个标签及关联标注`);
}
</script>

<template>
  <Modal
    :open="open"
    :footer="null"
    :width="520"
    destroy-on-close
    class="label-settings-modal"
    @cancel="emit('close')"
  >
    <template #title>
      <span class="label-settings-title" @click="handleModalBlankClick">
        <SettingOutlined />
        标签管理
      </span>
    </template>

    <div class="label-settings-shell" @click.self="handleModalBlankClick">
      <div class="label-settings-body" @click.self="handleModalBlankClick">
        <Form
        ref="formRef"
        :model="formModel"
        layout="vertical"
        class="label-settings-form"
        @finish="handleSave"
      >
        <Form.Item label="标签名称" name="name" :rules="nameRules">
          <div class="label-settings-name-row">
            <Input
              v-model:value="formModel.name"
              class="label-settings-name-input"
              placeholder="请输入标签名称"
              allow-clear
              :maxlength="50"
            />
            <Button type="primary" html-type="submit" class="label-settings-save-btn">
              {{ saveButtonText }}
            </Button>
          </div>
        </Form.Item>

        <Form.Item label="标签描述" name="description">
          <Input.TextArea
            v-model:value="formModel.description"
            placeholder="请输入标签描述"
            :rows="3"
            :maxlength="200"
            show-count
          />
        </Form.Item>
      </Form>

      <div class="label-settings-toolbar">
        <Checkbox
          :checked="allSelected"
          :disabled="annotationStore.labels.length === 0"
          @change="handleToggleAll"
        >
          全选
          <span
            v-if="annotationStore.labels.length > 0"
            class="label-settings-count"
          >
            （{{ selectedCount }}/{{ annotationStore.labels.length }}）
          </span>
        </Checkbox>
        <Popconfirm
          title="确定删除选中的标签？"
          description="关联的标注对象也将被删除，且不可撤销"
          ok-text="确定"
          cancel-text="取消"
          :disabled="selectedCount === 0"
          @confirm="handleDeleteSelected"
        >
          <Button danger size="small" :disabled="selectedCount === 0">
            <template #icon>
              <DeleteOutlined />
            </template>
            删除选中
          </Button>
        </Popconfirm>
      </div>

      <div class="label-settings-list-wrap">
        <VirtualList
          class="label-settings-list"
          :items="annotationStore.labels"
          :item-height="SETTINGS_ROW_HEIGHT"
          :get-item-key="(label: Label) => label.id"
        >
          <template #empty>
            <div class="label-settings-empty">暂无标签，请在上方添加</div>
          </template>
          <template #item="{ item: label }">
            <div
              class="label-settings-item"
              :class="{ 'is-editing': editingId === label.id }"
            >
              <Checkbox
                :checked="selectedIds.has(label.id)"
                class="label-settings-checkbox"
                @change="(e) => handleToggleOne(label.id, e.target.checked)"
              />
              <button
                type="button"
                class="label-settings-name-btn"
                @click="handleListNameClick(label)"
              >
                {{ label.name }}
              </button>
              <LabelColorPicker
                :color="label.color"
                @change="(color) => handleColorChange(label, color)"
              />
            </div>
          </template>
        </VirtualList>
      </div>
    </div>
    </div>
  </Modal>
</template>
