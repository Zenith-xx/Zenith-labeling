import type { ImportProgress } from './types';

/** 读取阶段未知总量时，用动态估算避免进度条过早到 100% */
export function estimateReadingTotalUnits(collected: number): number {
  return Math.max(Math.ceil(collected * 1.2), collected + 20, 1);
}

/** 各阶段在总进度条上的权重区间（0–100，单调递增） */
const PROGRESS_WEIGHT = {
  readingEnd: 30,
  analysisEnd: 35,
  imagesEnd: 55,
  jsonEnd: 100,
} as const;

function lerp(start: number, end: number, ratio: number): number {
  const t = Math.min(1, Math.max(0, ratio));
  return start + (end - start) * t;
}

export function getUnifiedImportPercent(progress: ImportProgress): number {
  if (progress.status === 'completed') return 100;

  const {
    status,
    scanned,
    parsed,
    totalImages,
    totalJson,
    completedUnits,
    totalUnits,
  } = progress;

  if (status === 'reading') {
    if (totalUnits <= 0) return 0;
    return Math.round(lerp(0, PROGRESS_WEIGHT.readingEnd, completedUnits / totalUnits));
  }

  if (status === 'scanning' || status === 'matching') {
    return PROGRESS_WEIGHT.analysisEnd;
  }

  if (status === 'parsing') {
    if (totalImages > 0 && scanned < totalImages) {
      return Math.round(
        lerp(PROGRESS_WEIGHT.analysisEnd, PROGRESS_WEIGHT.imagesEnd, scanned / totalImages)
      );
    }
    if (totalJson > 0) {
      if (parsed >= totalJson) return 100;
      return Math.round(
        lerp(PROGRESS_WEIGHT.imagesEnd, PROGRESS_WEIGHT.jsonEnd, parsed / totalJson)
      );
    }
    // 无 JSON：图片挂完即视为完成进度
    if (totalImages > 0 && scanned >= totalImages) return 100;
    if (totalImages > 0) {
      return PROGRESS_WEIGHT.imagesEnd;
    }
  }

  return 0;
}

/** 合并所有阶段统计为一行 */
export function getImportProgressDetail(progress: ImportProgress): string {
  const parts: string[] = [];

  if (progress.status === 'reading') {
    parts.push(`文件 ${progress.readFiles}`);
  } else if (progress.totalFiles > 0) {
    parts.push(`文件 ${progress.totalFiles}`);
  }

  if (progress.totalImages > 0) {
    parts.push(`图片 ${progress.scanned}/${progress.totalImages}`);
  }

  if (progress.totalJson > 0) {
    parts.push(`JSON ${progress.parsed}/${progress.totalJson}`);
  }

  if (progress.loadedAnnotations > 0) {
    parts.push(`标注 ${progress.loadedAnnotations}`);
  }

  if (parts.length === 0) {
    return progress.status === 'reading' ? '正在扫描文件夹…' : '正在处理…';
  }

  return parts.join(' · ');
}
