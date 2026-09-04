<script setup lang="ts">
import { computed, ref } from 'vue';
import { message } from 'ant-design-vue';
import { ChevronDown, FileText, Upload, Download } from 'lucide-vue-next';
import { useAnnotationStore } from '@/store/useAnnotationStore';
import type { Label, YoloFormat, CocoFormat, VocFormat } from '@/types';
import {
  isUserCancel,
  pickLabelsFolderFiles,
  pickXmlFolderFiles,
  pickWritableLabelsFolder,
  pickWritableTxtFile,
  pickWritableYamlFile,
  writeTextToDirectory,
  writeTextToFile,
  getBasename,
} from '@/utils/filePicker';
import {
  annotationsToYoloTxt,
  ensurePoseImportLabels,
  importYoloFromTxtFilesAsync,
  labelsFromNames,
  labelsToTxt,
  parseLabelsTxt,
} from '@/utils/yoloLabels';
import { downloadYoloImportSample } from '@/utils/yoloImportSamples';
import { downloadCocoImportSample } from '@/utils/cocoImportSamples';
import {
  getPoseClassNames,
  getPoseImportLabelNames,
  parsePoseConfigYaml,
  poseConfigToYaml,
  type PoseConfig,
} from '@/utils/poseConfig';
import { preloadImageMetadata } from '@/utils/imageLoader';
import {
  cocoExportToJson,
  getCocoOutputFilename,
  parseDetectionClassNames,
  parseSegmentationClassNames,
} from '@/utils/cocoExport';
import { importCocoJson } from '@/utils/cocoImport';
import { importVocFromXmlFilesAsync } from '@/utils/vocImport';
import { annotationsToVocXml } from '@/utils/vocExport';
import AnnotationFormatDropdown from './AnnotationFormatDropdown.vue';
import { EXPORT_FORMAT_GROUPS, UPLOAD_FORMAT_GROUPS } from './formatMenuOptions';
import YoloTransferModal from './YoloTransferModal.vue';
import ThemeSwitcher from '@/components/ThemeSwitcher/index.vue';
import ZenithLogo from '@/components/ZenithLogo.vue';
import { APP_NAME } from '@/constants/theme';
import type { MenuOpenChange } from './menuOpen';
import './index.css';

type UploadSelection =
  | { kind: 'yolo'; format: YoloFormat }
  | { kind: 'coco'; format: CocoFormat }
  | { kind: 'voc'; format: VocFormat };

type ExportSelection =
  | { kind: 'yolo'; format: YoloFormat }
  | { kind: 'coco'; format: CocoFormat }
  | { kind: 'voc'; format: VocFormat };

function parseUploadId(id: string): UploadSelection {
  const [kind, format] = id.split(':');
  if (kind === 'coco') {
    return { kind: 'coco', format: format as CocoFormat };
  }
  if (kind === 'voc') {
    return { kind: 'voc', format: format as VocFormat };
  }
  return { kind: 'yolo', format: format as YoloFormat };
}

function parseExportId(id: string): ExportSelection {
  const [kind, format] = id.split(':');
  if (kind === 'coco') {
    return { kind: 'coco', format: format as CocoFormat };
  }
  if (kind === 'voc') {
    return { kind: 'voc', format: format as VocFormat };
  }
  return { kind: 'yolo', format: format as YoloFormat };
}

const annotationStore = useAnnotationStore();

const labelsFileInputRef = ref<HTMLInputElement | null>(null);
const poseConfigFileInputRef = ref<HTMLInputElement | null>(null);
const cocoJsonFileInputRef = ref<HTMLInputElement | null>(null);
const cocoExportConfigInputRef = ref<HTMLInputElement | null>(null);
const cocoExportPoseConfigInputRef = ref<HTMLInputElement | null>(null);

const uploadModalOpen = ref(false);
const uploadSelection = ref<UploadSelection>({ kind: 'yolo', format: 'hbb' });
const uploadLabelsFileName = ref<string | null>(null);
const pendingUploadLabels = ref<Label[] | null>(null);
const pendingPoseConfig = ref<PoseConfig | null>(null);
const pendingCocoJson = ref<string | null>(null);
const cocoJsonFileName = ref<string | null>(null);
const uploading = ref(false);

const exportModalOpen = ref(false);
const exportSelection = ref<ExportSelection>({ kind: 'yolo', format: 'hbb' });
const exportLabelsFileDone = ref(false);
const exportCocoConfigFileName = ref<string | null>(null);
const pendingCocoExportClassNames = ref<string[] | null>(null);
const pendingCocoExportPoseConfig = ref<PoseConfig | null>(null);
const exportCocoConfigDone = ref(false);
const exporting = ref(false);

const formatMenuOpenId = ref<string | null>(null);

const setFormatMenuOpenId: MenuOpenChange = (next) => {
  formatMenuOpenId.value =
    typeof next === 'function' ? next(formatMenuOpenId.value) : next;
};

function resetUploadModal(): void {
  uploadLabelsFileName.value = null;
  pendingUploadLabels.value = null;
  pendingPoseConfig.value = null;
  pendingCocoJson.value = null;
  cocoJsonFileName.value = null;
  uploading.value = false;
}

function resetExportModal(): void {
  exportLabelsFileDone.value = false;
  exportCocoConfigFileName.value = null;
  pendingCocoExportClassNames.value = null;
  pendingCocoExportPoseConfig.value = null;
  exportCocoConfigDone.value = false;
  exporting.value = false;
}

function handleOpenUpload(id: string): void {
  if (annotationStore.imageList.length === 0) {
    message.warning('请先打开文件夹加载图片');
    return;
  }
  uploadSelection.value = parseUploadId(id);
  resetUploadModal();
  uploadModalOpen.value = true;
}

function handleOpenExport(id: string): void {
  if (annotationStore.imageList.length === 0) {
    message.warning('请先打开文件夹加载图片');
    return;
  }
  const selection = parseExportId(id);
  if (selection.kind === 'yolo' && annotationStore.labels.length === 0) {
    message.warning('请先上传标签');
    return;
  }
  if (selection.kind === 'voc' && annotationStore.labels.length === 0) {
    message.warning('请先创建标签');
    return;
  }
  exportSelection.value = selection;
  resetExportModal();
  exportModalOpen.value = true;
}

async function handleCocoExportConfigFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || exportSelection.value.kind !== 'coco') return;

  try {
    const text = await file.text();
    if (exportSelection.value.format === 'detection') {
      const classNames = parseDetectionClassNames(text);
      pendingCocoExportClassNames.value = classNames;
      pendingCocoExportPoseConfig.value = null;
    } else if (exportSelection.value.format === 'segmentation') {
      const classNames = parseSegmentationClassNames(text);
      pendingCocoExportClassNames.value = classNames;
      pendingCocoExportPoseConfig.value = null;
    } else {
      return;
    }
    exportCocoConfigFileName.value = file.name;
    exportCocoConfigDone.value = true;
  } catch (err) {
    message.error(err instanceof Error ? err.message : '配置文件无效');
  }
}

async function handleCocoExportPoseConfigChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file || exportSelection.value.kind !== 'coco') return;

  try {
    const config = parsePoseConfigYaml(await file.text());
    if (getPoseClassNames(config).length === 0) {
      throw new Error('Pose 配置中未定义类别');
    }
    exportCocoConfigFileName.value = file.name;
    pendingCocoExportPoseConfig.value = config;
    pendingCocoExportClassNames.value = null;
    exportCocoConfigDone.value = true;
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Pose 配置文件无效');
  }
}

async function handleLabelsFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  const names = parseLabelsTxt(await file.text());
  if (names.length === 0) {
    message.warning('标签文件为空');
    return;
  }

  uploadLabelsFileName.value = file.name;
  pendingUploadLabels.value = labelsFromNames(names);
  pendingPoseConfig.value = null;
}

async function handlePoseConfigFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const config = parsePoseConfigYaml(await file.text());
    uploadLabelsFileName.value = file.name;
    pendingPoseConfig.value = config;
    pendingUploadLabels.value = labelsFromNames(getPoseImportLabelNames(config));
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'Pose 配置文件无效');
  }
}

async function handleCocoJsonFileChange(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;

  try {
    const text = await file.text();
    cocoJsonFileName.value = file.name;
    pendingCocoJson.value = text;
  } catch (err) {
    message.error(err instanceof Error ? err.message : '读取 JSON 失败');
  }
}

function handleDownloadYoloSample(): void {
  if (uploadSelection.value.kind !== 'yolo') return;
  downloadYoloImportSample(uploadSelection.value.format);
}

function handleDownloadCocoSample(): void {
  if (uploadSelection.value.kind !== 'coco') return;
  downloadCocoImportSample(uploadSelection.value.format);
}

async function handlePickLabelsFolder(): Promise<void> {
  if (!pendingUploadLabels.value) {
    message.warning('请先选择标签文件');
    return;
  }

  uploading.value = true;
  try {
    const txtFiles = await pickLabelsFolderFiles();
    const poseConfig = pendingPoseConfig.value ?? annotationStore.poseConfig;
    const importLabels =
      uploadSelection.value.kind === 'yolo' && uploadSelection.value.format === 'pose'
        ? ensurePoseImportLabels(pendingUploadLabels.value, poseConfig)
        : pendingUploadLabels.value;
    const { annotationsByImage: imported, imagePatches } =
      await importYoloFromTxtFilesAsync(
        txtFiles,
        importLabels,
        annotationStore.imageList,
        uploadSelection.value.kind === 'yolo' ? uploadSelection.value.format : 'hbb',
        poseConfig
      );

    if (Object.keys(imagePatches).length > 0) {
      annotationStore.batchUpdateImages(imagePatches);
    }
    annotationStore.applyYoloImport(
      importLabels,
      imported,
      pendingPoseConfig.value ?? undefined,
      { replaceLabels: true }
    );

    const matched = Object.keys(imported).length;
    const annCount = Object.values(imported).reduce(
      (sum, anns) => sum + anns.length,
      0
    );
    message.success(
      `已导入 ${pendingUploadLabels.value.length} 个标签、${matched} 张图片共 ${annCount} 条标注`
    );
    uploadModalOpen.value = false;
    resetUploadModal();
  } catch (err) {
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : '导入失败');
  } finally {
    uploading.value = false;
  }
}

async function handleCocoImport(): Promise<void> {
  if (!pendingCocoJson.value || uploadSelection.value.kind !== 'coco') {
    message.warning('请先选择 COCO JSON 文件');
    return;
  }

  uploading.value = true;
  try {
    const result = importCocoJson(
      pendingCocoJson.value,
      uploadSelection.value.format,
      annotationStore.imageList,
      []
    );

    if (Object.keys(result.imagePatches).length > 0) {
      annotationStore.batchUpdateImages(result.imagePatches);
    }

    annotationStore.applyYoloImport(
      result.labels,
      result.annotationsByImage,
      result.poseConfig
    );

    message.success(
      `已导入 ${result.labels.length} 个标签、${result.matchedImages} 张图片共 ${result.annotationCount} 条标注`
    );
    uploadModalOpen.value = false;
    resetUploadModal();
  } catch (err) {
    message.error(err instanceof Error ? err.message : 'COCO 导入失败');
  } finally {
    uploading.value = false;
  }
}

async function handleVocImport(): Promise<void> {
  if (uploadSelection.value.kind !== 'voc') return;

  uploading.value = true;
  try {
    const xmlFiles = await pickXmlFolderFiles();
    if (xmlFiles.length === 0) {
      message.warning('文件夹中未找到 xml 文件');
      return;
    }

    const result = await importVocFromXmlFilesAsync(
      xmlFiles,
      annotationStore.imageList,
      uploadSelection.value.format
    );

    if (Object.keys(result.imagePatches).length > 0) {
      annotationStore.batchUpdateImages(result.imagePatches);
    }

    annotationStore.applyYoloImport(result.labels, result.annotationsByImage);

    message.success(
      `已导入 ${result.labels.length} 个标签、${result.matchedImages} 张图片共 ${result.annotationCount} 条标注`
    );
    uploadModalOpen.value = false;
    resetUploadModal();
  } catch (err) {
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : 'VOC 导入失败');
  } finally {
    uploading.value = false;
  }
}

async function handleExportLabelsFile(): Promise<void> {
  if (exportSelection.value.kind !== 'yolo') return;

  exporting.value = true;
  try {
    if (exportSelection.value.format === 'pose') {
      const handle = await pickWritableYamlFile();
      await writeTextToFile(handle, poseConfigToYaml(annotationStore.poseConfig));
    } else {
      const labelsFileHandle = await pickWritableTxtFile();
      await writeTextToFile(labelsFileHandle, labelsToTxt(annotationStore.labels));
    }
    exportLabelsFileDone.value = true;
    message.success(
      exportSelection.value.format === 'pose'
        ? 'Pose 配置文件已写入'
        : '标签文件已写入'
    );
  } catch (err) {
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : '写入配置文件失败');
  } finally {
    exporting.value = false;
  }
}

async function handleExportLabelsFolder(): Promise<void> {
  if (exportSelection.value.kind !== 'yolo' || !exportLabelsFileDone.value) {
    message.warning('请先选择并写入标签文件');
    return;
  }

  exporting.value = true;
  const hide = message.loading('正在准备图片尺寸…', 0);
  try {
    const patches = await preloadImageMetadata(annotationStore.imageList, {
      concurrency: 8,
    });
    if (patches.size > 0) {
      const patchRecord: Record<
        string,
        { url: string; width: number; height: number; loaded: boolean }
      > = {};
      for (const [id, patch] of patches.entries()) {
        patchRecord[id] = {
          url: patch.url,
          width: patch.width,
          height: patch.height,
          loaded: patch.loaded ?? true,
        };
      }
      annotationStore.batchUpdateImages(patchRecord);
    }
    hide();

    const dirHandle = await pickWritableLabelsFolder();
    const latestState = useAnnotationStore.getState();

    let exported = 0;
    for (const image of latestState.imageList) {
      const annotations = latestState.annotationsByImage[image.id] ?? [];
      if (image.width <= 0 || image.height <= 0) continue;
      const content = annotationsToYoloTxt(
        annotations,
        latestState.labels,
        image.width,
        image.height,
        exportSelection.value.format,
        latestState.poseConfig
      );
      const filename = `${getBasename(image.name)}.txt`;
      await writeTextToDirectory(dirHandle, filename, content);
      exported += 1;
    }

    message.success(`已覆盖 ${exported} 个图片标注 txt`);
    exportModalOpen.value = false;
    resetExportModal();
  } catch (err) {
    hide();
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : '导出失败');
  } finally {
    exporting.value = false;
  }
}

async function handleCocoExport(): Promise<void> {
  if (exportSelection.value.kind !== 'coco') return;
  if (!exportCocoConfigDone.value) {
    message.warning('请先选择配置文件');
    return;
  }

  exporting.value = true;
  const hide = message.loading('正在准备图片尺寸…', 0);
  try {
    const patches = await preloadImageMetadata(annotationStore.imageList, {
      concurrency: 8,
    });
    if (patches.size > 0) {
      const patchRecord: Record<
        string,
        { url: string; width: number; height: number; loaded: boolean }
      > = {};
      for (const [id, patch] of patches.entries()) {
        patchRecord[id] = {
          url: patch.url,
          width: patch.width,
          height: patch.height,
          loaded: patch.loaded ?? true,
        };
      }
      annotationStore.batchUpdateImages(patchRecord);
    }
    hide();

    const dirHandle = await pickWritableLabelsFolder();
    const latestState = useAnnotationStore.getState();
    const content = cocoExportToJson({
      format: exportSelection.value.format,
      images: latestState.imageList,
      annotationsByImage: latestState.annotationsByImage,
      labels: latestState.labels,
      ...(exportSelection.value.format === 'keypoints'
        ? { poseConfig: pendingCocoExportPoseConfig.value ?? undefined }
        : { classNames: pendingCocoExportClassNames.value ?? undefined }),
    });
    const filename = getCocoOutputFilename(exportSelection.value.format);
    await writeTextToDirectory(dirHandle, filename, content);

    message.success(`已导出 ${filename}`);
    exportModalOpen.value = false;
    resetExportModal();
  } catch (err) {
    hide();
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : 'COCO 导出失败');
  } finally {
    exporting.value = false;
  }
}

async function handleVocExport(): Promise<void> {
  if (exportSelection.value.kind !== 'voc') return;

  exporting.value = true;
  const hide = message.loading('正在准备图片尺寸…', 0);
  try {
    const patches = await preloadImageMetadata(annotationStore.imageList, {
      concurrency: 8,
    });
    if (patches.size > 0) {
      const patchRecord: Record<
        string,
        { url: string; width: number; height: number; loaded: boolean }
      > = {};
      for (const [id, patch] of patches.entries()) {
        patchRecord[id] = {
          url: patch.url,
          width: patch.width,
          height: patch.height,
          loaded: patch.loaded ?? true,
        };
      }
      annotationStore.batchUpdateImages(patchRecord);
    }
    hide();

    const dirHandle = await pickWritableLabelsFolder();
    const latestState = useAnnotationStore.getState();
    let exported = 0;

    for (const image of latestState.imageList) {
      if (image.width <= 0 || image.height <= 0) continue;
      const annotations = latestState.annotationsByImage[image.id] ?? [];
      const content = annotationsToVocXml(
        annotations,
        latestState.labels,
        image.name,
        image.width,
        image.height,
        exportSelection.value.format
      );
      const filename = `${getBasename(image.name)}.xml`;
      await writeTextToDirectory(dirHandle, filename, content);
      exported += 1;
    }

    message.success(`已导出 ${exported} 个 VOC XML 文件`);
    exportModalOpen.value = false;
    resetExportModal();
  } catch (err) {
    hide();
    if (isUserCancel(err)) return;
    message.error(err instanceof Error ? err.message : 'VOC 导出失败');
  } finally {
    exporting.value = false;
  }
}

const uploadModalTitle = computed(() => {
  const sel = uploadSelection.value;
  if (sel.kind === 'yolo') {
    return `上传 YOLO ${sel.format.toUpperCase()} 标签`;
  }
  if (sel.kind === 'voc') {
    return `上传 VOC ${sel.format === 'detection' ? 'Detection' : 'Segmentation'}`;
  }
  return `上传 COCO ${
    sel.format === 'detection'
      ? 'Detection'
      : sel.format === 'segmentation'
        ? 'Segmentation'
        : 'Keypoints'
  }`;
});

const exportModalTitle = computed(() => {
  const sel = exportSelection.value;
  if (sel.kind === 'yolo') {
    return `导出 YOLO ${sel.format.toUpperCase()} 标签`;
  }
  if (sel.kind === 'voc') {
    return `导出 VOC ${sel.format === 'detection' ? 'Detection' : 'Segmentation'}`;
  }
  return `导出 COCO ${
    sel.format === 'detection'
      ? 'Detection'
      : sel.format === 'segmentation'
        ? 'Segmentation'
        : 'Keypoints'
  }`;
});

const uploadYoloSteps = computed(() => {
  const sel = uploadSelection.value;
  if (sel.kind !== 'yolo') return [];
  return [
    sel.format === 'pose'
      ? {
          title: '选择 Pose 配置文件',
          description: 'yaml 文件，包含 has_visible 与 classes',
          buttonText: '选择 pose yaml',
          buttonIcon: FileText,
          status: uploadLabelsFileName.value
            ? `已选择：${uploadLabelsFileName.value}`
            : null,
          onAction: () => poseConfigFileInputRef.value?.click(),
        }
      : {
          title: '选择标签文件',
          buttonText: '选择标签 txt',
          buttonIcon: FileText,
          status: uploadLabelsFileName.value
            ? `已选择：${uploadLabelsFileName.value}`
            : null,
          onAction: () => labelsFileInputRef.value?.click(),
        },
    {
      title: '选择 labels 文件夹',
      buttonText: '选择 labels 文件夹',
      loading: uploading.value,
      disabled: !pendingUploadLabels.value,
      primary: true,
      onAction: handlePickLabelsFolder,
    },
  ];
});

const uploadVocSteps = computed(() => [
  {
    title: '选择 Annotations 文件夹',
    buttonText: '选择 XML 文件夹',
    buttonIcon: FileText,
    loading: uploading.value,
    primary: true,
    onAction: handleVocImport,
  },
]);

const uploadCocoSteps = computed(() => [
  {
    title: '选择 COCO JSON 文件',
    buttonText: '选择 JSON 文件',
    buttonIcon: FileText,
    status: cocoJsonFileName.value ? `已选择：${cocoJsonFileName.value}` : null,
    onAction: () => cocoJsonFileInputRef.value?.click(),
  },
  {
    title: '导入标注',
    description: '按图片文件名匹配并合并到当前项目',
    buttonText: '开始导入',
    loading: uploading.value,
    disabled: !pendingCocoJson.value,
    primary: true,
    onAction: handleCocoImport,
  },
]);

const exportYoloSteps = computed(() => {
  const sel = exportSelection.value;
  if (sel.kind !== 'yolo') return [];
  return [
    sel.format === 'pose'
      ? {
          title: '选择 Pose 配置文件',
          description: '选择要覆盖的 pose yaml（classes 与关键点顺序）',
          buttonText: '选择并写入 pose yaml',
          buttonIcon: FileText,
          loading: exporting.value && !exportLabelsFileDone.value,
          status: exportLabelsFileDone.value ? 'Pose 配置文件已写入' : null,
          onAction: handleExportLabelsFile,
        }
      : {
          title: '选择标签文件',
          buttonText: '选择并写入标签 txt',
          buttonIcon: FileText,
          loading: exporting.value && !exportLabelsFileDone.value,
          status: exportLabelsFileDone.value ? '标签文件已写入' : null,
          onAction: handleExportLabelsFile,
        },
    {
      title: '选择 labels 文件夹',
      description: '导出所有图片标注 txt 并覆盖原文件',
      buttonText: '选择 labels 文件夹',
      loading: exporting.value && exportLabelsFileDone.value,
      disabled: !exportLabelsFileDone.value,
      primary: true,
      onAction: handleExportLabelsFolder,
    },
  ];
});

const exportVocSteps = computed(() => {
  const sel = exportSelection.value;
  if (sel.kind !== 'voc') return [];
  return [
    {
      title: '选择导出目录',
      description:
        sel.format === 'detection'
          ? '每张图片生成一个 XML（rectangle → bndbox）'
          : '每张图片生成一个 XML（polygon → bndbox + polygon）',
      buttonText: '选择文件夹并导出',
      loading: exporting.value,
      primary: true,
      onAction: handleVocExport,
    },
  ];
});

const exportCocoSteps = computed(() => {
  const sel = exportSelection.value;
  if (sel.kind !== 'coco') return [];
  const configStep =
    sel.format === 'keypoints'
      ? {
          title: '选择 Pose 配置文件',
          buttonText: '选择 pose yaml',
          buttonIcon: FileText,
          loading: exporting.value && !exportCocoConfigDone.value,
          status: exportCocoConfigFileName.value
            ? `已选择：${exportCocoConfigFileName.value}`
            : null,
          onAction: () => cocoExportPoseConfigInputRef.value?.click(),
        }
      : sel.format === 'segmentation'
        ? {
            title: '选择分割标签文件',
            buttonText: '选择 labels txt',
            buttonIcon: FileText,
            loading: exporting.value && !exportCocoConfigDone.value,
            status: exportCocoConfigFileName.value
              ? `已选择：${exportCocoConfigFileName.value}`
              : null,
            onAction: () => cocoExportConfigInputRef.value?.click(),
          }
        : {
            title: '选择检测标签文件',
            buttonText: '选择 classes txt',
            buttonIcon: FileText,
            loading: exporting.value && !exportCocoConfigDone.value,
            status: exportCocoConfigFileName.value
              ? `已选择：${exportCocoConfigFileName.value}`
              : null,
            onAction: () => cocoExportConfigInputRef.value?.click(),
          };

  return [
    configStep,
    {
      title: '选择导出目录',
      description: `将生成 ${getCocoOutputFilename(sel.format)}（包含全部图片标注）`,
      buttonText: '选择文件夹并导出',
      loading: exporting.value && exportCocoConfigDone.value,
      disabled: !exportCocoConfigDone.value,
      primary: true,
      onAction: handleCocoExport,
    },
  ];
});

function closeUploadModal(): void {
  uploadModalOpen.value = false;
  resetUploadModal();
}

function closeExportModal(): void {
  exportModalOpen.value = false;
  resetExportModal();
}
</script>

<template>
  <div class="topbar">
    <input
      ref="labelsFileInputRef"
      type="file"
      accept=".txt,text/plain"
      style="display: none"
      @change="handleLabelsFileChange"
    />
    <input
      ref="poseConfigFileInputRef"
      type="file"
      accept=".yaml,.yml,text/yaml,application/x-yaml"
      style="display: none"
      @change="handlePoseConfigFileChange"
    />
    <input
      ref="cocoJsonFileInputRef"
      type="file"
      accept=".json,application/json"
      style="display: none"
      @change="handleCocoJsonFileChange"
    />
    <input
      ref="cocoExportConfigInputRef"
      type="file"
      accept=".txt,text/plain"
      style="display: none"
      @change="handleCocoExportConfigFileChange"
    />
    <input
      ref="cocoExportPoseConfigInputRef"
      type="file"
      accept=".yaml,.yml,text/yaml,application/x-yaml"
      style="display: none"
      @change="handleCocoExportPoseConfigChange"
    />

    <div class="topbar-left">
      <div class="topbar-logo">
        <ZenithLogo :size="28" />
      </div>
      <span class="topbar-title">{{ APP_NAME }}</span>
      <div class="topbar-actions">
        <AnnotationFormatDropdown
          menu-id="upload-menu"
          :groups="UPLOAD_FORMAT_GROUPS"
          :open-id="formatMenuOpenId"
          :on-open-change="setFormatMenuOpenId"
          :min-width="210"
          @select="handleOpenUpload"
        >
          <a-button
            type="text"
            class="topbar-btn topbar-btn-dropdown"
            tabindex="-1"
            @mousedown.prevent
          >
            <template #icon>
              <Upload :size="14" />
            </template>
            上传
            <ChevronDown class="topbar-btn-caret" :size="10" />
          </a-button>
        </AnnotationFormatDropdown>
        <AnnotationFormatDropdown
          menu-id="export-menu"
          :groups="EXPORT_FORMAT_GROUPS"
          :open-id="formatMenuOpenId"
          :on-open-change="setFormatMenuOpenId"
          :min-width="210"
          @select="handleOpenExport"
        >
          <a-button
            type="text"
            class="topbar-btn topbar-btn-dropdown"
            tabindex="-1"
            @mousedown.prevent
          >
            <template #icon>
              <Download :size="14" />
            </template>
            导出
            <ChevronDown class="topbar-btn-caret" :size="10" />
          </a-button>
        </AnnotationFormatDropdown>
        <ThemeSwitcher
          :open-id="formatMenuOpenId"
          :on-open-change="setFormatMenuOpenId"
        />
      </div>
    </div>

    <a-modal
      :open="uploadModalOpen"
      :title="uploadModalTitle"
      :footer="null"
      :destroy-on-close="true"
      :width="420"
      class="yolo-transfer-modal"
      @cancel="closeUploadModal"
    >
      <YoloTransferModal
        v-if="uploadSelection.kind === 'yolo'"
        :steps="uploadYoloSteps"
        show-sample-download
        :on-sample-download="handleDownloadYoloSample"
      />
      <YoloTransferModal
        v-else-if="uploadSelection.kind === 'voc'"
        :steps="uploadVocSteps"
      />
      <YoloTransferModal
        v-else
        :steps="uploadCocoSteps"
        show-sample-download
        :on-sample-download="handleDownloadCocoSample"
      />
    </a-modal>

    <a-modal
      :open="exportModalOpen"
      :title="exportModalTitle"
      :footer="null"
      :destroy-on-close="true"
      :width="420"
      class="yolo-transfer-modal"
      @cancel="closeExportModal"
    >
      <YoloTransferModal
        v-if="exportSelection.kind === 'yolo'"
        :steps="exportYoloSteps"
      />
      <YoloTransferModal
        v-else-if="exportSelection.kind === 'voc'"
        :steps="exportVocSteps"
      />
      <YoloTransferModal v-else :steps="exportCocoSteps" />
    </a-modal>
  </div>
</template>
