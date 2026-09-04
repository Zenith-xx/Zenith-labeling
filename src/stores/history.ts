import { create } from './zustandCompat';
import { bridgeVanillaStoreToPinia } from './piniaBridge';
import type { Command } from '../history/command';
import type { HistoryDebugInfo } from '../history/historyManager';
import { HistoryManager } from '../history/historyManager';
import {
  beginTransaction,
  cancelTransaction,
  commitTransaction,
  isInTransaction,
  recordTransactionCommand,
} from '../history/transaction';

const manager = new HistoryManager(1000, 100 * 1024 * 1024);

interface HistoryStore {
  canUndo: boolean;
  canRedo: boolean;
  undoSize: number;
  redoSize: number;
  memoryUsage: number;
  executeCommand: (command: Command) => void;
  /** 操作已应用到 store，仅登记历史 */
  pushCommand: (command: Command) => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  beginTransaction: (name: string) => void;
  commitTransaction: () => void;
  cancelTransaction: () => void;
  /** 开发模式：输出 History 调试信息 */
  debug: () => HistoryDebugInfo;
  /** 栈顶是否为隐藏操作（供 W 快捷键） */
  canRevealLastHidden: () => boolean;
}

function syncFlags(set: (partial: Partial<HistoryStore>) => void): void {
  set({
    canUndo: manager.canUndo,
    canRedo: manager.canRedo,
    undoSize: manager.undoSize,
    redoSize: manager.redoSize,
    memoryUsage: manager.memoryUsage,
  });
}

function notifyDirty(): void {
  void import('../storage/autoSave').then((m) => {
    m.notifyProjectDataChanged();
  });
}

function dispatchCommand(
  command: Command,
  set: (partial: Partial<HistoryStore>) => void,
  mode: 'execute' | 'push'
): void {
  if (isInTransaction()) {
    recordTransactionCommand(command);
    syncFlags(set);
    notifyDirty();
    return;
  }

  if (mode === 'execute') {
    if (manager.tryMerge(command)) {
      syncFlags(set);
      notifyDirty();
      return;
    }
    manager.execute(command);
  } else {
    manager.push(command);
  }
  syncFlags(set);
  notifyDirty();
}

const useHistoryStoreVanilla = create<HistoryStore>((set) => ({
  canUndo: false,
  canRedo: false,
  undoSize: 0,
  redoSize: 0,
  memoryUsage: 0,

  executeCommand: (command) => {
    dispatchCommand(command, set, 'execute');
  },

  pushCommand: (command) => {
    dispatchCommand(command, set, 'push');
  },

  undo: () => {
    if (!manager.undo()) return;
    syncFlags(set);
    notifyDirty();
  },

  redo: () => {
    if (!manager.redo()) return;
    syncFlags(set);
    notifyDirty();
  },

  clearHistory: () => {
    manager.clear();
    syncFlags(set);
  },

  beginTransaction: (name) => {
    beginTransaction(name);
  },

  commitTransaction: () => {
    const batch = commitTransaction();
    if (!batch) return;
    manager.push(batch);
    syncFlags(set);
    notifyDirty();
  },

  cancelTransaction: () => {
    cancelTransaction();
    syncFlags(set);
  },

  debug: () => {
    const info = manager.debug();
    if (import.meta.env.DEV) {
      const mb = (info.memoryBytes / (1024 * 1024)).toFixed(2);
      const maxMb = (info.maxMemoryBytes / (1024 * 1024)).toFixed(0);
      console.log(
        `[History]\nUndo: ${info.undoSize}\nRedo: ${info.redoSize}\nMemory: ${mb}MB / ${maxMb}MB\nLast: ${info.lastCommand ?? '(none)'}\nRecent: ${info.recentCommands.join(', ') || '(none)'}`
      );
    }
    return info;
  },

  canRevealLastHidden: () => manager.peekUndoName() === 'HIDE_ANNOTATION',
}));

export const useHistoryStore = bridgeVanillaStoreToPinia('history', useHistoryStoreVanilla);
