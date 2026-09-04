export function isTypingTarget(): boolean {
  const tag = (document.activeElement as HTMLElement | null)?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
}
