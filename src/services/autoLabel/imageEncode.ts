import type { ImageFile } from '../../types';

function mimeFromFilename(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.bmp')) return 'image/bmp';
  return 'image/jpeg';
}

/** 将当前图片转为 File，供 Labeling-Server multipart 上传 */
export async function imageFileToUploadFile(image: ImageFile): Promise<File> {
  if (image.file) {
    return image.file;
  }
  if (image.url) {
    const response = await fetch(image.url);
    if (!response.ok) throw new Error('无法读取图片数据');
    const blob = await response.blob();
    const type = blob.type || mimeFromFilename(image.name);
    return new File([blob], image.name, { type });
  }
  throw new Error('图片未加载，请等待图片显示后再运行 AI');
}
