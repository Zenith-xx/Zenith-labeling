import type { Annotation } from '../types';
import { getAnnotationMatchKey } from './datasetScanner';
import {
  isValidImportedAnnotation,
  parseLabelMeShape,
  parseRawAnnotation,
  type LabelMeShapeInput,
  type RawAnnotationInput,
} from './annotationShapeParse';
import {
  extractLabelsFromAnnotations,
  LabelRegistry,
  registerLabelsFromJson,
  syncImportedLabels,
} from './labelRegistry';
import { mapPool } from './folderCollector';
import { yieldToMain } from './yieldToMain';
import type { ParsedAnnotationBatch } from './types';
import { IMPORT_PARSE_BATCH_SIZE, IMPORT_TEXT_CONCURRENCY } from './types';
import type { PoseConfig } from '../utils/poseConfig';

interface RawAnnotation extends RawAnnotationInput {}

interface LabelMeShape extends LabelMeShapeInput {}

export interface ProjectJson {
  image?: string;
  imagePath?: string;
  labels?: import('../types').Label[];
  annotations?: RawAnnotation[];
  shapes?: LabelMeShape[];
}

export interface ParseAnnotationFileOptions {
  useTransaction?: boolean;
  onLabelsDiscovered?: (names: Set<string>) => void;
  poseConfig?: PoseConfig;
}

export interface ParseAnnotationFileResult {
  annotations: Annotation[];
  syncStats: {
    newlyCreatedInFile: number;
  };
}

function resolveLabelId(
  registry: LabelRegistry,
  labelName: string,
  options?: ParseAnnotationFileOptions
): string {
  if (registry.has(labelName)) {
    return registry.getLabelId(labelName);
  }
  syncImportedLabels([labelName], registry, { useTransaction: options?.useTransaction });
  return registry.getLabelId(labelName);
}

function parseJsonAnnotations(
  data: ProjectJson,
  registry: LabelRegistry,
  options?: ParseAnnotationFileOptions
): Annotation[] {
  if (Array.isArray(data.annotations)) {
    return data.annotations
      .map((raw) => {
        let labelId: string;
        if (raw.labelId && registry.getByName(raw.labelName ?? '')?.id === raw.labelId) {
          labelId = raw.labelId;
        } else if (raw.labelName) {
          labelId = resolveLabelId(registry, raw.labelName, options);
        } else if (raw.labelId) {
          labelId = raw.labelId;
        } else {
          labelId = resolveLabelId(registry, '未知', options);
        }
        return parseRawAnnotation(raw, labelId);
      })
      .filter(isValidImportedAnnotation);
  }

  if (Array.isArray(data.shapes)) {
    const annotations: Annotation[] = [];

    for (const shape of data.shapes) {
      const labelName = shape.label?.trim();
      if (!labelName) continue;
      const labelId = resolveLabelId(registry, labelName, options);
      const ann = parseLabelMeShape(shape, labelId);
      if (ann) annotations.push(ann);
    }
    return annotations;
  }

  return [];
}

function parseAnnotationText(
  text: string,
  registry: LabelRegistry,
  options?: ParseAnnotationFileOptions
): ParseAnnotationFileResult {
  let data: ProjectJson;
  try {
    data = JSON.parse(text);
  } catch {
    return { annotations: [], syncStats: { newlyCreatedInFile: 0 } };
  }

  const discovered = extractLabelsFromAnnotations(data);
  options?.onLabelsDiscovered?.(discovered);

  const embeddedCreated = registerLabelsFromJson(data, registry, {
    useTransaction: options?.useTransaction,
  });
  const syncResult = syncImportedLabels(discovered, registry, {
    useTransaction: options?.useTransaction,
  });

  const annotations = parseJsonAnnotations(data, registry, options);

  return {
    annotations,
    syncStats: {
      newlyCreatedInFile: embeddedCreated + syncResult.newlyCreatedCount,
    },
  };
}

/** 解析单个 JSON：先发现/同步标签，再创建 Annotation（仅 labelId） */
export async function parseAnnotationFile(
  file: File,
  registry: LabelRegistry,
  options?: ParseAnnotationFileOptions
): Promise<ParseAnnotationFileResult> {
  try {
    const text = await file.text();
    return parseAnnotationText(text, registry, options);
  } catch {
    return { annotations: [], syncStats: { newlyCreatedInFile: 0 } };
  }
}

export interface AnnotationParseInput {
  imageId: string;
  annotationFile: File;
}

export interface ParseAnnotationBatchOptions {
  useTransaction?: boolean;
  onLabelsDiscovered?: (names: Set<string>) => void;
  onBatchParsed?: (parsedCount: number, annotationCount: number) => void;
  /** 每批解析完成后回调（便于渐进写入 store） */
  onBatchComplete?: (
    batch: ParsedAnnotationBatch,
    parsedCount: number
  ) => void;
  poseConfig?: PoseConfig;
  textConcurrency?: number;
}

/**
 * 分批异步解析 JSON：批内并发读文本，标签注册仍串行（共享 LabelRegistry）。
 */
export async function parseAnnotationBatch(
  items: readonly AnnotationParseInput[],
  registry: LabelRegistry,
  batchSize = IMPORT_PARSE_BATCH_SIZE,
  shouldCancel?: () => boolean,
  options?: ParseAnnotationBatchOptions
): Promise<ParsedAnnotationBatch> {
  const annotationsByImage: Record<string, Annotation[]> = {};
  let annotationCount = 0;
  const textConcurrency = options?.textConcurrency ?? IMPORT_TEXT_CONCURRENCY;

  for (let i = 0; i < items.length; i += batchSize) {
    if (shouldCancel?.()) break;

    const slice = items.slice(i, i + batchSize);
    const texts = await mapPool(
      slice,
      textConcurrency,
      async (item) => {
        try {
          return await item.annotationFile.text();
        } catch {
          return null;
        }
      },
      shouldCancel
    );

    if (shouldCancel?.()) break;

    const batchAnnotations: Record<string, Annotation[]> = {};
    let batchCount = 0;

    for (let j = 0; j < slice.length; j += 1) {
      if (shouldCancel?.()) break;
      const text = texts[j];
      if (text == null) continue;

      const result = parseAnnotationText(text, registry, {
        useTransaction: options?.useTransaction,
        onLabelsDiscovered: options?.onLabelsDiscovered,
        poseConfig: options?.poseConfig,
      });

      if (result.annotations.length > 0) {
        batchAnnotations[slice[j].imageId] = result.annotations;
        annotationsByImage[slice[j].imageId] = result.annotations;
        batchCount += result.annotations.length;
        annotationCount += result.annotations.length;
      }
    }

    const parsedCount = Math.min(i + slice.length, items.length);
    options?.onBatchParsed?.(parsedCount, annotationCount);
    options?.onBatchComplete?.(
      { annotationsByImage: batchAnnotations, annotationCount: batchCount },
      parsedCount
    );
    await yieldToMain();
  }

  return {
    annotationsByImage,
    annotationCount,
  };
}

/** 从 JSON 文件名推断关联图片名（供旧 loadProjectFromFiles 兼容） */
export function resolveImageNameFromJson(jsonFileName: string, data: ProjectJson): string | null {
  if (data.image) return data.image;

  if (data.imagePath) {
    const parts = data.imagePath.split(/[/\\]/);
    return parts[parts.length - 1] || data.imagePath;
  }

  const key = getAnnotationMatchKey(jsonFileName);
  return key || null;
}

export type { RawAnnotation, LabelMeShape };
