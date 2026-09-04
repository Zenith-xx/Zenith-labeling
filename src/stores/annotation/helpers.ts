import type { Annotation, ImageFile, Label, PendingAnnotation, ToolType } from '../../types';
import type { ShowViewSnapshot } from '../../history';
import { clampRect, clampPoint } from '../../utils/annotationBounds';
import { annotationPatchFromObb, buildObbFromParams } from '../../utils/obbGeometry';
import { clampPoseKeypoints } from '../../utils/poseGeometry';
import { mergePoseLabels, type PoseConfig } from '../../utils/poseConfig';
import { resolveNewAnnotationGroupId } from '../../utils/annotationDisplay';
import { sortImageFileEntries } from '../../importer/fileOrder';
import type { AnnotationStore, ImagePatch } from './types';

export function notifyDirty(imageIds?: string | string[]): void {
  void import('../../storage/autoSave').then((m) => {
    m.notifyProjectDataChanged(imageIds);
  });
}

let labelsByIdCache: { source: Label[]; map: Map<string, Label> } | null = null;

export function getLabelFromList(labels: Label[], id: string): Label | undefined {
  if (!labelsByIdCache || labelsByIdCache.source !== labels) {
    labelsByIdCache = {
      source: labels,
      map: new Map(labels.map((label) => [label.id, label])),
    };
  }
  return labelsByIdCache.map.get(id);
}

export function buildAnnotatedImageIds(
  annotationsByImage: Record<string, Annotation[]>
): Record<string, true> {
  const ids: Record<string, true> = {};
  for (const [imageId, anns] of Object.entries(annotationsByImage)) {
    if (anns.length > 0) ids[imageId] = true;
  }
  return ids;
}

export function selectionState(
  primaryId: string | null,
  ids?: string[]
): Pick<AnnotationStore, 'selectedAnnotation' | 'selectedAnnotationIds'> {
  if (primaryId === null) {
    return { selectedAnnotation: null, selectedAnnotationIds: [] };
  }
  const selectedAnnotationIds = ids ?? [primaryId];
  return { selectedAnnotation: primaryId, selectedAnnotationIds };
}

export function pruneSelectionAfterRemoval(
  state: Pick<AnnotationStore, 'selectedAnnotation' | 'selectedAnnotationIds'>,
  removedId: string
): Pick<AnnotationStore, 'selectedAnnotation' | 'selectedAnnotationIds'> {
  const selectedAnnotationIds = state.selectedAnnotationIds.filter(
    (id) => id !== removedId
  );
  const selectedAnnotation =
    state.selectedAnnotation === removedId
      ? selectedAnnotationIds.length > 0
        ? selectedAnnotationIds[selectedAnnotationIds.length - 1]
        : null
      : state.selectedAnnotation;
  return { selectedAnnotation, selectedAnnotationIds };
}

export function mergeImportedLabels(existing: Label[], incoming: Label[]): Label[] {
  const byName = new Map(existing.map((label) => [label.name, label]));
  const merged = [...existing];

  for (const label of incoming) {
    if (!byName.has(label.name)) {
      byName.set(label.name, label);
      merged.push(label);
    }
  }

  return merged;
}

export function remapImportedAnnotations(
  annotationsByImage: Record<string, Annotation[]>,
  incomingLabels: Label[],
  mergedLabels: Label[]
): Record<string, Annotation[]> {
  const incomingIdToName = new Map(
    incomingLabels.map((label) => [label.id, label.name])
  );
  const mergedNameToId = new Map(
    mergedLabels.map((label) => [label.name, label.id])
  );

  const remapped: Record<string, Annotation[]> = {};
  for (const [imageId, annotations] of Object.entries(annotationsByImage)) {
    remapped[imageId] = annotations.map((ann) => {
      const labelName = incomingIdToName.get(ann.labelId);
      if (!labelName) return ann;
      const nextLabelId = mergedNameToId.get(labelName);
      if (!nextLabelId || nextLabelId === ann.labelId) return ann;
      return { ...ann, labelId: nextLabelId };
    });
  }
  return remapped;
}

export function patchImageList(
  imageList: ImageFile[],
  imageId: string,
  patch: ImagePatch
): ImageFile[] {
  const index = imageList.findIndex((img) => img.id === imageId);
  if (index < 0) return imageList;
  const next = [...imageList];
  next[index] = { ...next[index], ...patch };
  return next;
}

export function applyImagePatches(
  imageList: ImageFile[],
  patches: Record<string, ImagePatch>
): ImageFile[] {
  if (Object.keys(patches).length === 0) return imageList;
  return imageList.map((img) =>
    patches[img.id] ? { ...img, ...patches[img.id] } : img
  );
}

export function withSortedImageList<T extends {
  imageList: ImageFile[];
  currentImage: ImageFile | null;
  currentImageIndex: number;
}>(state: T): Pick<T, 'imageList' | 'currentImage' | 'currentImageIndex'> {
  if (state.imageList.length <= 1) {
    return {
      imageList: state.imageList,
      currentImage: state.currentImage,
      currentImageIndex: state.currentImageIndex,
    };
  }

  const imageList = sortImageFileEntries(state.imageList);
  const currentId = state.currentImage?.id;
  if (!currentId) {
    return { imageList, currentImage: state.currentImage, currentImageIndex: state.currentImageIndex };
  }

  const currentImageIndex = imageList.findIndex((img) => img.id === currentId);
  if (currentImageIndex < 0) {
    return { imageList, currentImage: state.currentImage, currentImageIndex: state.currentImageIndex };
  }

  return {
    imageList,
    currentImage: imageList[currentImageIndex],
    currentImageIndex,
  };
}

export function resolveGroupIdForPending(
  state: {
    pendingGroupIdInput: string;
    lastUsedGroupId: number | null;
    selectedAnnotation: string | null;
    annotationsByImage: Record<string, Annotation[]>;
  },
  pending: PendingAnnotation,
  imageId: string
): number | undefined {
  const isPoint = pending.shapeType === 'point';
  return resolveNewAnnotationGroupId(
    state.pendingGroupIdInput,
    state.lastUsedGroupId,
    {
      forKeypoint: isPoint,
      annotations: state.annotationsByImage[imageId] ?? [],
      selectedAnnotationId: state.selectedAnnotation,
    }
  );
}

export function buildAnnotationFromPending(
  pending: PendingAnnotation,
  labelId: string,
  currentImage: ImageFile,
  groupId?: number
): Annotation {
  let x = pending.x;
  let y = pending.y;
  let width = pending.width;
  let height = pending.height;

  if (
    pending.shapeType === 'rectangle' &&
    currentImage.width > 0 &&
    currentImage.height > 0
  ) {
    const clamped = clampRect(
      x,
      y,
      width,
      height,
      currentImage.width,
      currentImage.height
    );
    x = clamped.x;
    y = clamped.y;
    width = clamped.width;
    height = clamped.height;
  }

  if (
    pending.shapeType === 'point' &&
    currentImage.width > 0 &&
    currentImage.height > 0
  ) {
    const p = clampPoint(x, y, currentImage.width, currentImage.height);
    x = p.x;
    y = p.y;
  }

  if (pending.shapeType === 'rotated-rectangle') {
    const obb = buildObbFromParams(x, y, width, height, pending.angle ?? 0);
    const patch = annotationPatchFromObb(obb);
    return {
      id: pending.id,
      labelId,
      shapeType: 'rotated-rectangle',
      x: patch.x!,
      y: patch.y!,
      width: patch.width!,
      height: patch.height!,
      angle: patch.angle,
      points: patch.points,
      groupId,
    };
  }

  if (pending.shapeType === 'pose') {
    if (currentImage.width > 0 && currentImage.height > 0) {
      const clamped = clampRect(
        x,
        y,
        width,
        height,
        currentImage.width,
        currentImage.height
      );
      x = clamped.x;
      y = clamped.y;
      width = clamped.width;
      height = clamped.height;
    }
    return {
      id: pending.id,
      labelId,
      shapeType: 'pose',
      x,
      y,
      width,
      height,
      keypoints: clampPoseKeypoints(
        pending.keypoints ?? [],
        currentImage.width,
        currentImage.height
      ),
      groupId,
    };
  }

  return {
    id: pending.id,
    labelId,
    shapeType: pending.shapeType,
    x,
    y,
    width,
    height,
    points: pending.points,
    angle: pending.angle,
    keypoints: pending.keypoints,
    groupId,
  };
}

export function applyLabelRemoval(
  state: AnnotationStore,
  ids: string[]
): Partial<AnnotationStore> {
  const idSet = new Set(ids);
  const removedAnnIds = new Set<string>();
  const annotationsByImage: Record<string, Annotation[]> = {};
  const annotatedImageIds: Record<string, true> = {};

  for (const [imageId, anns] of Object.entries(state.annotationsByImage)) {
    const kept: Annotation[] = [];
    for (const ann of anns) {
      if (idSet.has(ann.labelId)) {
        removedAnnIds.add(ann.id);
      } else {
        kept.push(ann);
      }
    }
    annotationsByImage[imageId] = kept;
    if (kept.length > 0) annotatedImageIds[imageId] = true;
  }

  const selectedAnnotationIds = state.selectedAnnotationIds.filter(
    (id) => !removedAnnIds.has(id)
  );
  const selectedAnnotation =
    state.selectedAnnotation && removedAnnIds.has(state.selectedAnnotation)
      ? selectedAnnotationIds.length > 0
        ? selectedAnnotationIds[selectedAnnotationIds.length - 1]
        : null
      : state.selectedAnnotation;

  return {
    labels: state.labels.filter((l) => !idSet.has(l.id)),
    annotationsByImage,
    annotatedImageIds,
    selectedAnnotation,
    selectedAnnotationIds,
  };
}
