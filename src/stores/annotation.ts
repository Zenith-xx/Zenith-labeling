import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import type { ToolType, Annotation, ImageFile, Label, PendingAnnotation } from '../types';
import { releaseAllImageUrls } from '../utils/imageLoader';
import { DEFAULT_POSE_CONFIG, mergePoseLabels, type PoseConfig } from '../utils/poseConfig';
import {
  formatGroupIdInputValue,
  parseGroupIdInput,
} from '../utils/annotationDisplay';
import { clampViewZoom } from '../utils/canvasView';
import { getNextLabelColor } from '../constants/labelColors';
import { getShortcutLabel, getShortcutMaxPage } from '../utils/labelShortcut';
import { sortImageFileEntries } from '../importer/fileOrder';
import { generateId } from '../utils/id';
import { useHistoryStore } from './history';
import { isInTransaction } from '../history/transaction';
import {
  AddAnnotationCommand,
  ChangeAnnotationGroupIdCommand,
  ChangeAnnotationLabelCommand,
  CreateLabelCommand,
} from '../history';
import type { AnnotationStore } from './annotation/types';
import {
  notifyDirty,
  getLabelFromList,
  selectionState,
  pruneSelectionAfterRemoval,
  buildAnnotatedImageIds,
  mergeImportedLabels,
  remapImportedAnnotations,
  patchImageList,
  applyImagePatches,
  withSortedImageList,
  resolveGroupIdForPending,
  buildAnnotationFromPending,
  applyLabelRemoval,
} from './annotation/helpers';


const useAnnotationStoreVanilla = create<AnnotationStore>((set, get) => ({
  currentTool: 'select',
  setCurrentTool: (tool) => {
    const state = get();
    if (state.waitingForLabel || state.labelModalOpen) return;
    if (
      (tool === 'rectangle' ||
        tool === 'polygon' ||
        tool === 'obb' ||
        tool === 'point') &&
      !get().currentImage
    ) {
      return;
    }
    set({ currentTool: tool });
  },

  labels: [],
  addLabel: (label) => set((state) => ({ labels: [...state.labels, label] })),
  updateLabel: (id, updates) =>
    set((state) => ({
      labels: state.labels.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    })),
  removeLabelWithoutHistory: (id) => {
    get().removeLabelsWithoutHistory([id]);
  },
  removeLabelsWithoutHistory: (ids) => {
    if (ids.length === 0) return;
    set((state) => {
      if (ids.length === 1 && !state.labels.some((l) => l.id === ids[0])) {
        return state;
      }
      return applyLabelRemoval(state, ids);
    });
  },
  clearAllLabels: () => {
    const { labels, annotationsByImage } = get();
    if (labels.length === 0) return;

    const dirtyImageIds = Object.keys(annotationsByImage);
    const clearedByImage: Record<string, Annotation[]> = {};
    for (const imageId of dirtyImageIds) {
      clearedByImage[imageId] = [];
    }

    set({
      labels: [],
      annotationsByImage: clearedByImage,
      annotatedImageIds: {},
      ...selectionState(null),
      pendingAnnotation: null,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: false,
    });
    useHistoryStore.getState().clearHistory();
    notifyDirty(dirtyImageIds.length > 0 ? dirtyImageIds : undefined);
  },
  getLabelById: (id) => getLabelFromList(get().labels, id),

  annotationsByImage: {},
  annotatedImageIds: {},
  getAnnotationsForImage: (imageId) => get().annotationsByImage[imageId] ?? [],
  addAnnotation: (imageId, annotation) =>
    set((state) => ({
      annotationsByImage: {
        ...state.annotationsByImage,
        [imageId]: [...(state.annotationsByImage[imageId] ?? []), annotation],
      },
      annotatedImageIds: { ...state.annotatedImageIds, [imageId]: true },
    })),
  removeAnnotation: (imageId, annotationId) =>
    set((state) => {
      const nextAnns = (state.annotationsByImage[imageId] ?? []).filter(
        (a) => a.id !== annotationId
      );
      const nextAnnotated = { ...state.annotatedImageIds };
      if (nextAnns.length === 0) {
        delete nextAnnotated[imageId];
      }
      return {
        annotationsByImage: {
          ...state.annotationsByImage,
          [imageId]: nextAnns,
        },
        annotatedImageIds: nextAnnotated,
        ...pruneSelectionAfterRemoval(state, annotationId),
      };
    }),
  updateAnnotation: (imageId, annotationId, updates) =>
    set((state) => ({
      annotationsByImage: {
        ...state.annotationsByImage,
        [imageId]: (state.annotationsByImage[imageId] ?? []).map((a) =>
          a.id === annotationId ? { ...a, ...updates } : a
        ),
      },
    })),
  updateAnnotations: (imageId, updatesById) =>
    set((state) => {
      const anns = state.annotationsByImage[imageId] ?? [];
      if (anns.length === 0) return state;
      let changed = false;
      const next = anns.map((ann) => {
        const patch = updatesById[ann.id];
        if (!patch) return ann;
        changed = true;
        return { ...ann, ...patch };
      });
      if (!changed) return state;
      return {
        annotationsByImage: {
          ...state.annotationsByImage,
          [imageId]: next,
        },
      };
    }),
  replaceImageAnnotations: (imageId, annotations) =>
    set((state) => {
      const nextAnnotated = { ...state.annotatedImageIds };
      if (annotations.length === 0) {
        delete nextAnnotated[imageId];
      } else {
        nextAnnotated[imageId] = true;
      }
      return {
        annotationsByImage: {
          ...state.annotationsByImage,
          [imageId]: annotations,
        },
        annotatedImageIds: nextAnnotated,
      };
    }),
  setAnnotationHidden: (imageId, annotationId, hidden) =>
    set((state) => {
      const anns = state.annotationsByImage[imageId] ?? [];
      const target = anns.find((a) => a.id === annotationId);
      if (!target || target.hidden === hidden) return state;
      return {
        annotationsByImage: {
          ...state.annotationsByImage,
          [imageId]: anns.map((a) =>
            a.id === annotationId ? { ...a, hidden } : a
          ),
        },
      };
    }),
  captureViewSnapshot: () => {
    const state = get();
    return {
      currentImageId: state.currentImage?.id ?? null,
      currentImageIndex: state.currentImageIndex,
      stagePosition: { ...state.stagePosition },
      selectedAnnotation: state.selectedAnnotation,
      selectedAnnotationIds: [...state.selectedAnnotationIds],
    };
  },
  focusAnnotationView: (imageId, annotationId) => {
    const { imageList } = get();
    const index = imageList.findIndex((img) => img.id === imageId);
    const image = index >= 0 ? imageList[index] : null;
    set({
      currentImage: image ?? get().currentImage,
      currentImageIndex: image ? index : get().currentImageIndex,
      ...selectionState(annotationId),
      stagePosition: { x: 0, y: 0 },
    });
  },
  restoreViewSnapshot: (snapshot) => {
    const { imageList } = get();
    const image =
      snapshot.currentImageId != null
        ? imageList.find((img) => img.id === snapshot.currentImageId) ?? null
        : null;
    set({
      currentImage: image,
      currentImageIndex: snapshot.currentImageIndex,
      stagePosition: { ...snapshot.stagePosition },
      ...(snapshot.selectedAnnotationIds
        ? {
            selectedAnnotation:
              snapshot.selectedAnnotationIds.length > 0
                ? snapshot.selectedAnnotationIds[
                    snapshot.selectedAnnotationIds.length - 1
                  ]
                : null,
            selectedAnnotationIds: [...snapshot.selectedAnnotationIds],
          }
        : { selectedAnnotation: snapshot.selectedAnnotation }),
    });
  },
  revealLastHidden: () => {
    const history = useHistoryStore.getState();
    if (!history.canRevealLastHidden()) return false;
    history.undo();
    return true;
  },

  ...selectionState(null),
  setSelectedAnnotation: (id) => {
    const state = get();
    if (id === null) {
      if (state.selectedAnnotation === null && state.selectedAnnotationIds.length === 0) {
        return;
      }
      set(selectionState(null));
      return;
    }
    if (
      state.selectedAnnotation === id &&
      state.selectedAnnotationIds.length === 1 &&
      state.selectedAnnotationIds[0] === id
    ) {
      return;
    }
    set(selectionState(id));
  },
  setSelectedAnnotations: (ids) => {
    const uniqueIds = [...new Set(ids)];
    if (uniqueIds.length === 0) {
      get().clearSelection();
      return;
    }
    set(selectionState(uniqueIds[uniqueIds.length - 1], uniqueIds));
  },
  selectAnnotationOnHover: (id, additive) => {
    const state = get();
    if (!additive) {
      if (
        state.selectedAnnotation === id &&
        state.selectedAnnotationIds.length === 1 &&
        state.selectedAnnotationIds[0] === id
      ) {
        return;
      }
      set(selectionState(id));
      return;
    }
    if (state.selectedAnnotationIds.includes(id)) return;
    set({
      selectedAnnotation: id,
      selectedAnnotationIds: [...state.selectedAnnotationIds, id],
    });
  },
  toggleAnnotationSelection: (id) => {
    const state = get();
    if (state.selectedAnnotationIds.includes(id)) {
      const nextIds = state.selectedAnnotationIds.filter((item) => item !== id);
      if (nextIds.length === 0) {
        set(selectionState(null));
        return;
      }
      set(selectionState(nextIds[nextIds.length - 1], nextIds));
      return;
    }
    set({
      selectedAnnotation: id,
      selectedAnnotationIds: [...state.selectedAnnotationIds, id],
    });
  },
  clearSelection: () => {
    const state = get();
    if (state.selectedAnnotation === null && state.selectedAnnotationIds.length === 0) {
      return;
    }
    set(selectionState(null));
  },

  currentImage: null,
  currentImageIndex: -1,
  setCurrentImage: (image) => {
    const { imageList } = get();
    const index = imageList.findIndex((img) => img.id === image.id);
    set({
      currentImage: image,
      currentImageIndex: index,
      ...selectionState(null),
    });
  },
  setCurrentImageByIndex: (index) => {
    const { imageList } = get();
    if (index < 0 || index >= imageList.length) return;
    const image = imageList[index];
    if (image.id === get().currentImage?.id) return;
    set({
      currentImage: image,
      currentImageIndex: index,
      ...selectionState(null),
    });
  },
  goToPreviousImage: () => {
    const { currentImageIndex } = get();
    if (currentImageIndex <= 0) return;
    get().setCurrentImageByIndex(currentImageIndex - 1);
  },
  goToNextImage: () => {
    const { imageList, currentImageIndex } = get();
    if (currentImageIndex < 0 || currentImageIndex >= imageList.length - 1) return;
    get().setCurrentImageByIndex(currentImageIndex + 1);
  },
  imageList: [],
  addImage: (image) =>
    set((state) => ({ imageList: [...state.imageList, image] })),
  updateImage: (imageId, patch) =>
    set((state) => {
      const imageList = patchImageList(state.imageList, imageId, patch);
      const currentImage =
        state.currentImage?.id === imageId
          ? { ...state.currentImage, ...patch }
          : state.currentImage;
      return { imageList, currentImage };
    }),
  batchUpdateImages: (patches) =>
    set((state) => {
      const imageList = applyImagePatches(state.imageList, patches);
      let currentImage = state.currentImage;
      if (currentImage && patches[currentImage.id]) {
        currentImage = { ...currentImage, ...patches[currentImage.id] };
      }
      return { imageList, currentImage };
    }),
  loadProject: (project) => {
    releaseAllImageUrls();
    useHistoryStore.getState().clearHistory();
    const sortedImages = sortImageFileEntries(project.images);
    const firstImage = sortedImages[0] ?? null;
    set({
      imageList: sortedImages,
      labels: project.labels,
      annotationsByImage: project.annotationsByImage,
      annotatedImageIds: buildAnnotatedImageIds(project.annotationsByImage),
      currentImage: firstImage,
      currentImageIndex: firstImage ? 0 : -1,
      ...selectionState(null),
      zoom: 1,
      stagePosition: { x: 0, y: 0 },
      pendingAnnotation: null,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: false,
      currentTool: 'select',
      showLabels: true,
    });
  },
  prepareDatasetImport: () => {
    releaseAllImageUrls();
    useHistoryStore.getState().clearHistory();
    set({
      imageList: [],
      labels: [],
      annotationsByImage: {},
      annotatedImageIds: {},
      currentImage: null,
      currentImageIndex: -1,
      ...selectionState(null),
      zoom: 1,
      stagePosition: { x: 0, y: 0 },
      pendingAnnotation: null,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: false,
      shortcutPage: 0,
      lastUsedGroupId: null,
      selectedKeypointIndex: null,
      pendingGroupIdInput: '',
      currentTool: 'select',
    });
  },
  appendImages: (images) => {
    if (images.length === 0) return;
    set((state) => {
      const imageList = [...state.imageList, ...images];
      const hadCurrent = state.currentImage !== null;
      const currentImage = hadCurrent ? state.currentImage : imageList[0] ?? null;
      const currentImageIndex = hadCurrent
        ? state.currentImageIndex
        : currentImage
          ? 0
          : -1;
      return { imageList, currentImage, currentImageIndex };
    });
  },
  appendAnnotations: (labels, annotationsByImage) => {
    if (labels.length === 0 && Object.keys(annotationsByImage).length === 0) return;
    set((state) => {
      const labelsById = new Map(state.labels.map((l) => [l.id, l]));
      const labelsByName = new Map(state.labels.map((l) => [l.name, l]));
      for (const label of labels) {
        if (!labelsById.has(label.id) && !labelsByName.has(label.name)) {
          labelsById.set(label.id, label);
          labelsByName.set(label.name, label);
        }
      }

      const mergedAnnotations = { ...state.annotationsByImage, ...annotationsByImage };
      return {
        labels: Array.from(labelsById.values()),
        annotationsByImage: mergedAnnotations,
        annotatedImageIds: buildAnnotatedImageIds(mergedAnnotations),
      };
    });
  },
  appendAnnotationsOnly: (annotationsByImage) => {
    if (Object.keys(annotationsByImage).length === 0) return;
    set((state) => {
      const mergedAnnotations = { ...state.annotationsByImage, ...annotationsByImage };
      return {
        annotationsByImage: mergedAnnotations,
        annotatedImageIds: buildAnnotatedImageIds(mergedAnnotations),
      };
    });
  },
  resetLabelsForImport: () => {
    if (get().labels.length === 0) return;
    set({ labels: [] });
  },
  finishDatasetImport: () => {
    set((state) => ({ ...withSortedImageList(state), showLabels: true }));
    void import('../storage/autoSave').then((m) => {
      m.markAllImagesDirtyForFolderSave();
      m.notifyProjectDataChanged();
    });
  },
  sortImageListByPath: () => {
    set((state) => withSortedImageList(state));
  },

  zoom: 1,
  setZoom: (zoom) => set({ zoom: clampViewZoom(zoom) }),

  showLabels: true,
  setShowLabels: (show) => set({ showLabels: show }),
  toggleShowLabels: () => {
    const { labels, currentImage } = get();
    if (!currentImage || labels.length === 0) return;
    set((state) => ({ showLabels: !state.showLabels }));
  },

  stagePosition: { x: 0, y: 0 },
  setStagePosition: (pos) => set({ stagePosition: pos }),
  setViewTransform: (zoom, stagePosition) =>
    set({
      zoom: clampViewZoom(zoom),
      stagePosition,
    }),

  resetZoomOnImageChange: true,
  setResetZoomOnImageChange: (reset) => set({ resetZoomOnImageChange: reset }),

  mousePosition: { x: 0, y: 0 },
  setMousePosition: (pos) => set({ mousePosition: pos }),

  pendingAnnotation: null,
  editingAnnotationId: null,
  labelModalOpen: false,
  waitingForLabel: false,
  shortcutPage: 0,
  lastUsedLabelName: '',
  lastUsedGroupId: null,
  pendingGroupIdInput: '',
  setPendingGroupIdInput: (value) => set({ pendingGroupIdInput: value }),
  poseConfig: DEFAULT_POSE_CONFIG,
  setPoseConfig: (config) =>
    set((state) => ({
      poseConfig: config,
      labels: mergePoseLabels(state.labels, config),
    })),
  selectedKeypointIndex: null,
  setSelectedKeypointIndex: (index) => set({ selectedKeypointIndex: index }),
  beginWaitingForLabel: (pending, options) => {
    const state = get();
    let pendingGroupIdInput = '';
    if (options?.preserveGroupId || pending.shapeType === 'point') {
      pendingGroupIdInput =
        state.pendingGroupIdInput ||
        formatGroupIdInputValue(state.lastUsedGroupId);
    }
    set({
      pendingAnnotation: pending,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: true,
      shortcutPage: 0,
      pendingGroupIdInput,
    });
  },
  cancelWaitingForLabel: () =>
    set({
      pendingAnnotation: null,
      waitingForLabel: false,
      shortcutPage: 0,
      pendingGroupIdInput: '',
    }),
  nextShortcutPage: () => {
    const { labels, shortcutPage } = get();
    const maxPage = getShortcutMaxPage(labels.length);
    if (labels.length === 0 || shortcutPage >= maxPage) return;
    const next = shortcutPage + 1;
    set({ shortcutPage: next });
  },
  previousShortcutPage: () => {
    const { shortcutPage } = get();
    if (shortcutPage <= 0) return;
    const next = shortcutPage - 1;
    set({ shortcutPage: next });
  },
  confirmPendingWithShortcutDigit: (digit) => {
    const {
      waitingForLabel,
      pendingAnnotation,
      currentImage,
      labels,
      shortcutPage,
    } = get();
    if (!waitingForLabel || !pendingAnnotation || !currentImage) return false;

    const label = getShortcutLabel(labels, digit, shortcutPage);
    if (!label) return false;

    const groupId = resolveGroupIdForPending(
      get(),
      pendingAnnotation,
      currentImage.id
    );
    const annotation = buildAnnotationFromPending(
      pendingAnnotation,
      label.id,
      currentImage,
      groupId
    );
    const isPoint = pendingAnnotation.shapeType === 'point';

    set({
      pendingAnnotation: null,
      waitingForLabel: false,
      labelModalOpen: false,
      shortcutPage: 0,
      pendingGroupIdInput: isPoint ? formatGroupIdInputValue(groupId) : '',
      lastUsedGroupId: groupId !== undefined ? groupId : null,
      lastUsedLabelName: label.name,
      ...selectionState(annotation.id),
      selectedKeypointIndex: null,
      currentTool: isPoint ? 'point' : 'select',
    });

    useHistoryStore
      .getState()
      .executeCommand(new AddAnnotationCommand(currentImage.id, annotation));
    return true;
  },
  openLabelModalFromWaiting: (labelName) =>
    set((state) => ({
      labelModalOpen: true,
      waitingForLabel: false,
      shortcutPage: 0,
      lastUsedLabelName: labelName?.trim() || state.lastUsedLabelName,
    })),
  openLabelModal: (pending) =>
    set({
      pendingAnnotation: pending,
      editingAnnotationId: null,
      labelModalOpen: true,
      waitingForLabel: false,
    }),
  openEditLabelModal: (annotationId) => {
    const { currentImage, annotationsByImage } = get();
    const ann =
      currentImage != null
        ? annotationsByImage[currentImage.id]?.find((a) => a.id === annotationId)
        : undefined;
    set({
      pendingAnnotation: null,
      editingAnnotationId: annotationId,
      labelModalOpen: true,
      waitingForLabel: false,
      pendingGroupIdInput: formatGroupIdInputValue(ann?.groupId),
    });
  },
  confirmLabelByText: (labelName, description) => {
    const trimmed = labelName.trim();
    if (!trimmed) return;

    const {
      pendingAnnotation,
      editingAnnotationId,
      currentImage,
      labels,
    } = get();
    if (!currentImage) return;

    const history = useHistoryStore.getState();
    let labelId: string;
    const existing = labels.find((l) => l.name === trimmed);

    if (existing) {
      labelId = existing.id;
    } else {
      const newLabel: Label = {
        id: generateId(),
        name: trimmed,
        color: getNextLabelColor(labels.length),
        description: description?.trim() || undefined,
      };
      history.beginTransaction('confirm-label');
      history.executeCommand(new CreateLabelCommand(newLabel));
      labelId = newLabel.id;
    }

    if (editingAnnotationId) {
      const prev = (get().annotationsByImage[currentImage.id] ?? []).find(
        (a) => a.id === editingAnnotationId
      );
      const beforeLabelId = prev?.labelId;
      const beforeGroupId = prev?.groupId;
      const afterGroupId = parseGroupIdInput(get().pendingGroupIdInput);
      const labelChanged = Boolean(beforeLabelId && beforeLabelId !== labelId);
      const groupIdChanged = beforeGroupId !== afterGroupId;

      set({
        editingAnnotationId: null,
        labelModalOpen: false,
        waitingForLabel: false,
        ...selectionState(editingAnnotationId),
        lastUsedLabelName: trimmed,
        lastUsedGroupId: afterGroupId !== undefined ? afterGroupId : null,
        pendingGroupIdInput:
          prev?.shapeType === 'point'
            ? formatGroupIdInputValue(afterGroupId)
            : '',
      });

      if (labelChanged || groupIdChanged) {
        if (!isInTransaction()) {
          history.beginTransaction('edit-annotation');
        }
        if (labelChanged && beforeLabelId) {
          history.executeCommand(
            new ChangeAnnotationLabelCommand(
              currentImage.id,
              editingAnnotationId,
              beforeLabelId,
              labelId
            )
          );
        }
        if (groupIdChanged) {
          history.executeCommand(
            new ChangeAnnotationGroupIdCommand(
              currentImage.id,
              editingAnnotationId,
              beforeGroupId,
              afterGroupId
            )
          );
        }
      }
      history.commitTransaction();
      return;
    }

    if (!pendingAnnotation) {
      history.commitTransaction();
      return;
    }

    const groupId = resolveGroupIdForPending(
      get(),
      pendingAnnotation,
      currentImage.id
    );
    const annotation = buildAnnotationFromPending(
      pendingAnnotation,
      labelId,
      currentImage,
      groupId
    );
    const isPoint = pendingAnnotation.shapeType === 'point';

    set({
      pendingAnnotation: null,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: false,
      pendingGroupIdInput: isPoint ? formatGroupIdInputValue(groupId) : '',
      lastUsedGroupId: groupId !== undefined ? groupId : null,
      lastUsedLabelName: trimmed,
      ...selectionState(annotation.id),
      selectedKeypointIndex: null,
      currentTool: isPoint ? 'point' : 'select',
    });

    history.executeCommand(
      new AddAnnotationCommand(currentImage.id, annotation)
    );
    history.commitTransaction();
  },
  cancelLabelModal: () =>
    set({
      pendingAnnotation: null,
      editingAnnotationId: null,
      labelModalOpen: false,
      waitingForLabel: false,
      selectedKeypointIndex: null,
      pendingGroupIdInput: '',
    }),

  /** 清空当前图标注：不可撤销，并释放全部 Undo/Redo 快照 */
  clearCurrentImageAnnotations: () => {
    const { currentImage, annotationsByImage, labels } = get();
    if (!currentImage || labels.length === 0) return;
    const anns = annotationsByImage[currentImage.id] ?? [];
    if (anns.length === 0) return;

    const nextAnnotated = { ...get().annotatedImageIds };
    delete nextAnnotated[currentImage.id];

    set({
      annotationsByImage: {
        ...annotationsByImage,
        [currentImage.id]: [],
      },
      annotatedImageIds: nextAnnotated,
      ...selectionState(null),
    });

    useHistoryStore.getState().clearHistory();
    notifyDirty(currentImage.id);
  },
  applyYoloImport: (labels, annotationsByImage, poseConfig, options) => {
    useHistoryStore.getState().clearHistory();
    set((state) => {
      const replaceLabels = options?.replaceLabels !== false;
      const mergedLabels = poseConfig
        ? mergePoseLabels(
            replaceLabels ? labels : mergeImportedLabels(state.labels, labels),
            poseConfig
          )
        : replaceLabels
          ? labels
          : mergeImportedLabels(state.labels, labels);

      const remappedImport = remapImportedAnnotations(
        annotationsByImage,
        labels,
        mergedLabels
      );

      let annotationsByImageNext: Record<string, Annotation[]>;
      if (replaceLabels) {
        const oldIdToName = new Map(
          state.labels.map((label) => [label.id, label.name])
        );
        const nameToNewId = new Map(
          mergedLabels.map((label) => [label.name, label.id])
        );

        annotationsByImageNext = { ...state.annotationsByImage };
        for (const [imageId, imported] of Object.entries(remappedImport)) {
          annotationsByImageNext[imageId] = imported;
        }
        for (const [imageId, annotations] of Object.entries(annotationsByImageNext)) {
          if (imageId in remappedImport) continue;
          annotationsByImageNext[imageId] = annotations
            .map((ann) => {
              const name = oldIdToName.get(ann.labelId);
              if (!name) return ann;
              const nextLabelId = nameToNewId.get(name);
              return nextLabelId ? { ...ann, labelId: nextLabelId } : null;
            })
            .filter((ann): ann is Annotation => ann !== null);
        }
      } else {
        annotationsByImageNext = {
          ...state.annotationsByImage,
          ...remappedImport,
        };
      }

      return {
        labels: mergedLabels,
        annotationsByImage: annotationsByImageNext,
        annotatedImageIds: buildAnnotatedImageIds(annotationsByImageNext),
        ...selectionState(null),
        ...(poseConfig ? { poseConfig } : {}),
      };
    });
    notifyDirty(Object.keys(annotationsByImage));
  },
}));

export const useAnnotationStore = bridgeVanillaStoreToPinia('annotation', useAnnotationStoreVanilla);
