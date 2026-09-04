<script setup lang="ts">
import { themeColors } from '@/constants/theme';

withDefaults(
  defineProps<{
    size?: number;
  }>(),
  {
    size: 28,
  }
);
</script>

<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 28 28"
    fill="none"
    aria-hidden="true"
  >
    <rect width="28" height="28" rx="6" :fill="themeColors.primaryStrong" />
    <path
      d="M7 9h13l-8 10h13"
      stroke="#ffffff"
      stroke-width="2.4"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <circle cx="20.5" cy="8" r="2.5" :fill="themeColors.primary" />
  </svg>
</template>
