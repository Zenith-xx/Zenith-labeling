const LAST_PROJECT_ID_KEY = 'labeling-vue3:lastProjectId';
const DISMISSED_RESTORE_KEY = 'labeling-vue3:dismissedRestore';

interface DismissedRestore {
  projectId: string;
  updatedAt: number;
}

export function getLastProjectId(): string | null {
  try {
    return localStorage.getItem(LAST_PROJECT_ID_KEY);
  } catch {
    return null;
  }
}

export function setLastProjectId(projectId: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_ID_KEY, projectId);
  } catch {
    // ignore
  }
}

function readDismissedRestore(): DismissedRestore | null {
  try {
    const raw = localStorage.getItem(DISMISSED_RESTORE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DismissedRestore;
    if (!parsed.projectId || typeof parsed.updatedAt !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setDismissedRestore(projectId: string, updatedAt: number): void {
  try {
    localStorage.setItem(
      DISMISSED_RESTORE_KEY,
      JSON.stringify({ projectId, updatedAt } satisfies DismissedRestore)
    );
  } catch {
    // ignore
  }
}

export function shouldOfferRestore(project: {
  id: string;
  updatedAt: number;
}): boolean {
  const dismissed = readDismissedRestore();
  if (!dismissed) return true;
  if (dismissed.projectId !== project.id) return true;
  return project.updatedAt > dismissed.updatedAt;
}
