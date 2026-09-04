<script setup lang="ts" generic="T">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type CSSProperties,
} from 'vue';
import './index.css';

const props = withDefaults(
  defineProps<{
    items: T[];
    itemHeight: number;
    overscan?: number;
    class?: string;
    style?: CSSProperties;
    getItemKey: (item: T, index: number) => string | number;
    scrollToIndex?: number | null;
    horizontalScroll?: boolean;
    contentMinWidth?: number;
  }>(),
  {
    overscan: 6,
    scrollToIndex: null,
    horizontalScroll: false,
  }
);

defineSlots<{
  item?: (props: { item: T; index: number }) => unknown;
  default?: (props: { item: T; index: number }) => unknown;
  empty?: () => unknown;
}>();

const viewportRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(0);
const scrollTopRef = ref(0);
const programmaticScrollRef = ref(false);
let resizeObserver: ResizeObserver | null = null;

function computeScrollTopForIndex(
  index: number | null | undefined,
  currentScrollTop: number,
  height: number,
  itemHeight: number,
  itemCount: number
): number {
  if (index == null || index < 0 || height <= 0) {
    return currentScrollTop;
  }

  const itemTop = index * itemHeight;
  const itemBottom = itemTop + itemHeight;
  let next = currentScrollTop;

  if (itemTop < currentScrollTop) {
    next = itemTop;
  } else if (itemBottom > currentScrollTop + height) {
    next = itemBottom - height;
  }

  const maxScrollTop = Math.max(0, itemCount * itemHeight - height);
  return Math.max(0, Math.min(next, maxScrollTop));
}

const effectiveViewportHeight = computed(() =>
  viewportHeight.value > 0
    ? viewportHeight.value
    : Math.max(props.itemHeight * 12, 240)
);

const sliceInfo = computed(() => {
  const count = props.items.length;
  if (count === 0) {
    return { start: 0, end: 0, offsetY: 0 };
  }
  const viewport = effectiveViewportHeight.value;
  const visible = Math.ceil(viewport / props.itemHeight);
  const rawStart = Math.floor(scrollTop.value / props.itemHeight);
  const startIdx = Math.max(0, rawStart - props.overscan);
  const endIdx = Math.min(count, rawStart + visible + props.overscan);
  return {
    start: startIdx,
    end: endIdx,
    offsetY: startIdx * props.itemHeight,
  };
});

const visibleItems = computed(() =>
  props.items.slice(sliceInfo.value.start, sliceInfo.value.end)
);

const viewportStyle = computed<CSSProperties>(() => ({
  ...props.style,
  overflowY: 'auto',
  overflowX: props.horizontalScroll ? 'auto' : undefined,
  position: 'relative',
}));

const innerStyle = computed<CSSProperties>(() => ({
  height: `${props.items.length * props.itemHeight}px`,
  position: 'relative',
  minWidth: props.contentMinWidth,
}));

const windowStyle = computed<CSSProperties>(() => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: props.contentMinWidth ? undefined : 0,
  width: props.contentMinWidth,
  minWidth: props.contentMinWidth ? '100%' : undefined,
  transform: `translateY(${sliceInfo.value.offsetY}px)`,
}));

function onScroll(event: Event): void {
  if (programmaticScrollRef.value) return;
  const target = event.currentTarget as HTMLDivElement;
  const next = target.scrollTop;
  if (next === scrollTopRef.value) return;
  scrollTopRef.value = next;
  scrollTop.value = next;
}

function scrollToTargetIndex(): void {
  const el = viewportRef.value;
  if (!el || props.scrollToIndex == null || props.scrollToIndex < 0) return;

  const target = computeScrollTopForIndex(
    props.scrollToIndex,
    el.scrollTop,
    effectiveViewportHeight.value,
    props.itemHeight,
    props.items.length
  );
  if (Math.abs(target - el.scrollTop) < 1) return;

  programmaticScrollRef.value = true;
  el.scrollTop = target;
  scrollTopRef.value = target;
  scrollTop.value = target;
  requestAnimationFrame(() => {
    programmaticScrollRef.value = false;
  });
}

function measureViewport(): void {
  const el = viewportRef.value;
  if (!el) return;
  const next = el.clientHeight;
  if (next > 0) viewportHeight.value = next;
}

onMounted(() => {
  const el = viewportRef.value;
  if (!el) return;

  measureViewport();
  nextTick(() => {
    measureViewport();
    requestAnimationFrame(measureViewport);
  });

  resizeObserver = new ResizeObserver(measureViewport);
  resizeObserver.observe(el);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});

watch(
  () => [props.scrollToIndex, viewportHeight.value, props.itemHeight, props.items.length] as const,
  () => {
    nextTick(scrollToTargetIndex);
  },
  { flush: 'post' }
);

watch(
  () => props.items.length,
  () => {
    nextTick(measureViewport);
  }
);
</script>

<template>
  <div
    v-if="items.length === 0"
    ref="viewportRef"
    :class="props.class"
    :style="props.style"
  >
    <slot name="empty" />
  </div>
  <div
    v-else
    ref="viewportRef"
    :class="props.class"
    :style="viewportStyle"
    @scroll="onScroll"
  >
    <div :style="innerStyle">
      <div :style="windowStyle">
        <div
          v-for="(item, i) in visibleItems"
          :key="getItemKey(item, sliceInfo.start + i)"
          :style="{ height: `${itemHeight}px`, boxSizing: 'border-box' }"
        >
          <slot name="item" :item="item" :index="sliceInfo.start + i">
            <slot :item="item" :index="sliceInfo.start + i" />
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>
