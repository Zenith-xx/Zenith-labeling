<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';
import { Button, Modal } from 'ant-design-vue';
import { ChevronDown, ChevronUp } from 'lucide-vue-next';
import { BASIC_COLOR_PALETTE } from '@/constants/labelColors';
import {
  hexToHsv,
  hexToRgb,
  hsvToHex,
  hsvToRgb,
  isValidHex,
  normalizeHex,
  rgbToHex,
  rgbToHsv,
  type Hsv,
} from '@/utils/colorFormat';
import './LabelColorPicker.css';

const CUSTOM_COLOR_SLOTS = 16;
const CUSTOM_STORAGE_KEY = 'labeling-vue3-label-custom-colors';

const props = defineProps<{
  color: string;
}>();

const emit = defineEmits<{
  change: [color: string];
}>();

const open = ref(false);
const draftHex = ref(normalizeHex(props.color));
const draftHsv = reactive<Hsv>({ h: 0, s: 100, v: 100 });
const draftRgb = reactive({ r: 255, g: 0, b: 0 });
const customColors = ref<(string | null)[]>(createEmptyCustomSlots());
const selectedCustomIndex = ref<number | null>(null);
const supportsEyeDropper = typeof window !== 'undefined' && 'EyeDropper' in window;

const svAreaRef = ref<HTMLElement | null>(null);
const hueTrackRef = ref<HTMLElement | null>(null);
const draggingSv = ref(false);
const draggingHue = ref(false);

const hueBackground = computed(
  () =>
    `hsl(${draftHsv.h}, 100%, 50%)`
);

const svMarkerStyle = computed(() => ({
  left: `${draftHsv.s}%`,
  top: `${100 - draftHsv.v}%`,
}));

const hueMarkerStyle = computed(() => ({
  top: `${(draftHsv.h / 360) * 100}%`,
}));

const customColorActionLabel = computed(() =>
  isEditingCustomSlot.value ? '更新自定义颜色' : '添加到自定义颜色'
);

const isEditingCustomSlot = computed(() => {
  if (selectedCustomIndex.value === null) return false;
  const slotColor = customColors.value[selectedCustomIndex.value];
  if (!slotColor) return false;
  return normalizeHex(slotColor) !== normalizeHex(draftHex.value);
});

function createEmptyCustomSlots(): (string | null)[] {
  return Array.from({ length: CUSTOM_COLOR_SLOTS }, () => null);
}

function loadCustomColors(): (string | null)[] {
  if (typeof window === 'undefined') return createEmptyCustomSlots();
  try {
    const raw = window.localStorage.getItem(CUSTOM_STORAGE_KEY);
    if (!raw) return createEmptyCustomSlots();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return createEmptyCustomSlots();
    const slots = createEmptyCustomSlots();
    for (let i = 0; i < CUSTOM_COLOR_SLOTS; i += 1) {
      const value = parsed[i];
      slots[i] = typeof value === 'string' && isValidHex(value) ? normalizeHex(value) : null;
    }
    return slots;
  } catch {
    return createEmptyCustomSlots();
  }
}

function saveCustomColors(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CUSTOM_STORAGE_KEY, JSON.stringify(customColors.value));
}

function syncDraftFromHex(hex: string): void {
  const normalized = normalizeHex(hex);
  draftHex.value = normalized;
  const { r, g, b } = hexToRgb(normalized);
  draftRgb.r = r;
  draftRgb.g = g;
  draftRgb.b = b;
  const hsv = hexToHsv(normalized);
  draftHsv.h = hsv.h;
  draftHsv.s = hsv.s;
  draftHsv.v = hsv.v;
}

function syncDraftFromHsv(): void {
  const hex = hsvToHex(draftHsv.h, draftHsv.s, draftHsv.v);
  draftHex.value = hex;
  const { r, g, b } = hsvToRgb(draftHsv.h, draftHsv.s, draftHsv.v);
  draftRgb.r = r;
  draftRgb.g = g;
  draftRgb.b = b;
}

function syncDraftFromRgb(): void {
  const hex = rgbToHex(draftRgb.r, draftRgb.g, draftRgb.b);
  draftHex.value = hex;
  const hsv = rgbToHsv(draftRgb.r, draftRgb.g, draftRgb.b);
  draftHsv.h = hsv.h;
  draftHsv.s = hsv.s;
  draftHsv.v = hsv.v;
}

function setDraftHex(hex: string): void {
  if (!isValidHex(hex)) return;
  syncDraftFromHex(hex);
}

function handleOpen(): void {
  open.value = true;
}

function handleCancel(): void {
  open.value = false;
}

function handleConfirm(): void {
  emit('change', normalizeHex(draftHex.value));
  open.value = false;
}

function clearSelectedCustomIndex(): void {
  selectedCustomIndex.value = null;
}

function handlePickBasic(color: string): void {
  clearSelectedCustomIndex();
  setDraftHex(color);
}

function handlePickCustom(color: string | null, index: number): void {
  if (!color) {
    selectedCustomIndex.value = index;
    return;
  }
  if (selectedCustomIndex.value !== index) {
    setDraftHex(color);
  }
  selectedCustomIndex.value = index;
}

function handleAddCustomColor(): void {
  const hex = normalizeHex(draftHex.value);

  if (isEditingCustomSlot.value && selectedCustomIndex.value !== null) {
    const targetIndex = selectedCustomIndex.value;
    customColors.value = customColors.value.map((color, index) => {
      if (index === targetIndex) return hex;
      if (color === hex) return null;
      return color;
    });
    saveCustomColors();
    return;
  }

  const existingIndex = customColors.value.findIndex((color) => color === hex);
  if (existingIndex >= 0) {
    selectedCustomIndex.value = existingIndex;
    return;
  }

  const selectedEmptyIndex =
    selectedCustomIndex.value !== null &&
    customColors.value[selectedCustomIndex.value] === null
      ? selectedCustomIndex.value
      : -1;
  const emptyIndex =
    selectedEmptyIndex >= 0
      ? selectedEmptyIndex
      : customColors.value.findIndex((color) => color === null);

  if (emptyIndex < 0) {
    customColors.value[CUSTOM_COLOR_SLOTS - 1] = hex;
    selectedCustomIndex.value = CUSTOM_COLOR_SLOTS - 1;
  } else {
    customColors.value[emptyIndex] = hex;
    selectedCustomIndex.value = emptyIndex;
  }
  saveCustomColors();
}

async function handlePickScreenColor(): Promise<void> {
  if (!supportsEyeDropper) return;
  try {
    const EyeDropperCtor = (
      window as unknown as {
        EyeDropper: new () => { open: () => Promise<{ sRGBHex: string }> };
      }
    ).EyeDropper;
    const eyeDropper = new EyeDropperCtor();
    const result = await eyeDropper.open();
    if (result?.sRGBHex) {
      clearSelectedCustomIndex();
      setDraftHex(result.sRGBHex);
    }
  } catch {
    // user cancelled
  }
}

function updateSvFromPointer(clientX: number, clientY: number): void {
  const area = svAreaRef.value;
  if (!area) return;
  const rect = area.getBoundingClientRect();
  const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  draftHsv.s = Math.round((x / rect.width) * 100);
  draftHsv.v = Math.round(100 - (y / rect.height) * 100);
  syncDraftFromHsv();
}

function updateHueFromPointer(clientY: number): void {
  const track = hueTrackRef.value;
  if (!track) return;
  const rect = track.getBoundingClientRect();
  const y = Math.max(0, Math.min(rect.height, clientY - rect.top));
  draftHsv.h = Math.round((y / rect.height) * 360);
  syncDraftFromHsv();
}

function handleSvPointerDown(event: PointerEvent): void {
  draggingSv.value = true;
  svAreaRef.value?.setPointerCapture(event.pointerId);
  updateSvFromPointer(event.clientX, event.clientY);
}

function handleSvPointerMove(event: PointerEvent): void {
  if (!draggingSv.value) return;
  updateSvFromPointer(event.clientX, event.clientY);
}

function handleSvPointerUp(event: PointerEvent): void {
  draggingSv.value = false;
  svAreaRef.value?.releasePointerCapture(event.pointerId);
}

function handleHuePointerDown(event: PointerEvent): void {
  draggingHue.value = true;
  hueTrackRef.value?.setPointerCapture(event.pointerId);
  updateHueFromPointer(event.clientY);
}

function handleHuePointerMove(event: PointerEvent): void {
  if (!draggingHue.value) return;
  updateHueFromPointer(event.clientY);
}

function handleHuePointerUp(event: PointerEvent): void {
  draggingHue.value = false;
  hueTrackRef.value?.releasePointerCapture(event.pointerId);
}

function parseChannel(value: number | string | null): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.round(parsed);
  }
  return null;
}

function handleHexInput(value: string): void {
  const next = value.startsWith('#') ? value : `#${value}`;
  draftHex.value = next;
  if (isValidHex(next)) {
    syncDraftFromHex(next);
  }
}

function handleHueChange(value: number | string | null): void {
  const next = parseChannel(value);
  if (next === null) return;
  draftHsv.h = Math.max(0, Math.min(360, next));
  syncDraftFromHsv();
}

function handleSatChange(value: number | string | null): void {
  const next = parseChannel(value);
  if (next === null) return;
  draftHsv.s = Math.max(0, Math.min(100, next));
  syncDraftFromHsv();
}

function handleValChange(value: number | string | null): void {
  const next = parseChannel(value);
  if (next === null) return;
  draftHsv.v = Math.max(0, Math.min(100, next));
  syncDraftFromHsv();
}

function handleRgbChange(channel: 'r' | 'g' | 'b', value: number | string | null): void {
  const next = parseChannel(value);
  if (next === null) return;
  draftRgb[channel] = Math.max(0, Math.min(255, next));
  syncDraftFromRgb();
}

watch(
  () => props.color,
  (value) => {
    if (!open.value) {
      syncDraftFromHex(value);
    }
  }
);

watch(open, (isOpen) => {
  if (!isOpen) {
    clearSelectedCustomIndex();
    return;
  }
  customColors.value = loadCustomColors();
  syncDraftFromHex(props.color);
});

onBeforeUnmount(() => {
  draggingSv.value = false;
  draggingHue.value = false;
});
</script>

<template>
  <button
      type="button"
      class="label-color-swatch-btn"
      :style="{ backgroundColor: color }"
      title="修改颜色"
      @click.stop="handleOpen"
    />

    <Modal
      :open="open"
      title="选择颜色"
      :width="620"
      :footer="null"
      destroy-on-close
      class="label-color-dialog"
      @cancel="handleCancel"
    >
      <div class="label-color-dialog-body">
        <div class="label-color-dialog-left">
          <div class="label-color-section-title">基本颜色</div>
          <div class="label-color-basic-grid">
            <button
              v-for="preset in BASIC_COLOR_PALETTE"
              :key="preset"
              type="button"
              class="label-color-basic-swatch"
              :class="{ 'is-active': normalizeHex(draftHex) === preset }"
              :style="{ backgroundColor: preset }"
              :title="preset"
              @click="handlePickBasic(preset)"
            />
          </div>
          <Button
            v-if="supportsEyeDropper"
            block
            size="small"
            class="label-color-screen-btn"
            @click="handlePickScreenColor"
          >
            屏幕取色
          </Button>

          <div class="label-color-section-title label-color-section-title--custom">
            自定义颜色
          </div>
          <div class="label-color-custom-grid">
            <button
              v-for="(slotColor, index) in customColors"
              :key="index"
              type="button"
              class="label-color-custom-swatch"
              :class="{
                'is-empty': !slotColor,
                'is-active': selectedCustomIndex === index,
              }"
              :style="slotColor ? { backgroundColor: slotColor } : undefined"
              :title="slotColor ?? '空槽位'"
              @click="handlePickCustom(slotColor, index)"
            />
          </div>
          <Button block size="small" class="label-color-add-custom-btn" @click="handleAddCustomColor">
            {{ customColorActionLabel }}
          </Button>
        </div>

        <div class="label-color-dialog-right">
          <div class="label-color-spectrum-row">
            <div
              ref="svAreaRef"
              class="label-color-sv-area"
              :style="{ backgroundColor: hueBackground }"
              @pointerdown="handleSvPointerDown"
              @pointermove="handleSvPointerMove"
              @pointerup="handleSvPointerUp"
              @pointercancel="handleSvPointerUp"
            >
              <span class="label-color-sv-marker" :style="svMarkerStyle" />
            </div>
            <div
              ref="hueTrackRef"
              class="label-color-hue-track"
              @pointerdown="handleHuePointerDown"
              @pointermove="handleHuePointerMove"
              @pointerup="handleHuePointerUp"
              @pointercancel="handleHuePointerUp"
            >
              <span class="label-color-hue-marker" :style="hueMarkerStyle" />
            </div>
          </div>

          <div class="label-color-values-row">
            <div
              class="label-color-preview"
              :style="{ backgroundColor: draftHex }"
            />
            <div class="label-color-values">
              <div class="label-color-value-grid">
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Hue:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftHsv.h"
                      @input="handleHueChange(($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleHueChange(draftHsv.h + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleHueChange(draftHsv.h - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Sat:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftHsv.s"
                      @input="handleSatChange(($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleSatChange(draftHsv.s + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleSatChange(draftHsv.s - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Val:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftHsv.v"
                      @input="handleValChange(($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleValChange(draftHsv.v + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleValChange(draftHsv.v - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Red:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftRgb.r"
                      @input="handleRgbChange('r', ($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('r', draftRgb.r + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('r', draftRgb.r - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Green:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftRgb.g"
                      @input="handleRgbChange('g', ($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('g', draftRgb.g + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('g', draftRgb.g - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
                <label class="label-color-value-item">
                  <span class="label-color-value-label">Blue:</span>
                  <div class="label-color-number">
                    <input
                      class="label-color-number-input"
                      type="text"
                      inputmode="numeric"
                      :value="draftRgb.b"
                      @input="handleRgbChange('b', ($event.target as HTMLInputElement).value)"
                    />
                    <div class="label-color-spinner">
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('b', draftRgb.b + 1)"
                      >
                        <ChevronUp :size="10" />
                      </button>
                      <button
                        type="button"
                        class="label-color-spinner-btn"
                        @click="handleRgbChange('b', draftRgb.b - 1)"
                      >
                        <ChevronDown :size="10" />
                      </button>
                    </div>
                  </div>
                </label>
              </div>
              <div class="label-color-hex-row">
                <span class="label-color-value-label">HTML:</span>
                <input
                  class="label-color-hex-input"
                  :value="draftHex"
                  maxlength="7"
                  @input="(e) => handleHexInput((e.target as HTMLInputElement).value)"
                />
              </div>
            </div>
          </div>

          <div class="label-color-dialog-actions">
            <Button type="primary" @click="handleConfirm">确定</Button>
            <Button @click="handleCancel">取消</Button>
          </div>
        </div>
      </div>
    </Modal>
</template>
