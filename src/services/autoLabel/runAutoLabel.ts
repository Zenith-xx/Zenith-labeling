import { imageFileToUploadFile } from './imageEncode';
import { predictLabelingServer, inferenceContextToPredictParams } from './labelingServerClient';
import { predictionToRemoteShapes } from './detectionConverter';
import { applyAutoLabelResult } from './applyAutoLabelResult';
import { resolveLabelingServerUrl } from './resolveServerUrl';
import {
  resolveActiveInferenceSession,
  resolveInferenceContext,
  validateInferenceContext,
  type InferenceContext,
} from '../../features/ai';
import { useModelStore } from '@/store/useModelStore';
import { useAiStore } from '../../store/useAiStore';
import { useAnnotationStore } from '../../store/useAnnotationStore';
import type { ImageFile } from '../../types';

async function resolveServerUrlOnce(): Promise<string> {
  const ai = useAiStore.getState();
  const serverUrl = await resolveLabelingServerUrl(
    ai.serverUrl,
    Math.min(ai.timeoutSec, 10)
  );
  if (serverUrl !== ai.serverUrl) {
    useAiStore.getState().setServerUrl(serverUrl);
  }
  return serverUrl;
}

async function resolveCurrentInferenceContext(): Promise<InferenceContext> {
  await useModelStore.getState().ensureModels();
  const session = resolveActiveInferenceSession();
  return resolveInferenceContext(session);
}

async function runAutoLabelOnImage(
  image: ImageFile,
  serverUrl: string,
  context: InferenceContext
): Promise<number> {
  const ai = useAiStore.getState();

  if (!image.file && !image.url) {
    throw new Error(`图片未加载: ${image.name}`);
  }

  const imageFile = await imageFileToUploadFile(image);
  const result = await predictLabelingServer({
    serverUrl,
    timeoutSec: ai.timeoutSec,
    params: inferenceContextToPredictParams(context),
    imageFile,
  });

  const shapes = predictionToRemoteShapes(result);
  return applyAutoLabelResult(image.id, shapes, ai.replaceExisting);
}

export async function runAutoLabelOnCurrentImage(): Promise<number> {
  const { currentImage } = useAnnotationStore.getState();
  if (!currentImage) {
    throw new Error('请先选择图片');
  }

  useAiStore.getState().setPredicting(true);
  try {
    const context = await resolveCurrentInferenceContext();
    validateInferenceContext(context);
    const serverUrl = await resolveServerUrlOnce();
    return await runAutoLabelOnImage(currentImage, serverUrl, context);
  } finally {
    useAiStore.getState().setPredicting(false);
  }
}
