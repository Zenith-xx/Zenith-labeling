import type { Command } from './command';

const DEFAULT_MAX_STACK = 1000;
const DEFAULT_MAX_MEMORY = 100 * 1024 * 1024;

export interface HistoryDebugInfo {
  undoSize: number;
  redoSize: number;
  memoryBytes: number;
  maxMemoryBytes: number;
  maxStack: number;
  lastCommand: string | null;
  recentCommands: string[];
}

/**
 * Undo / Redo 栈管理（纯逻辑，不依赖 React）。
 * V2：按内存估算淘汰 + maxStack 备用上限 + Command 合并。
 */
export class HistoryManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxStack: number;
  private maxMemorySize: number;
  private currentMemorySize = 0;

  constructor(
    maxStack = DEFAULT_MAX_STACK,
    maxMemorySize = DEFAULT_MAX_MEMORY
  ) {
    this.maxStack = Math.max(1, maxStack);
    this.maxMemorySize = Math.max(1024, maxMemorySize);
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get undoSize(): number {
    return this.undoStack.length;
  }

  get redoSize(): number {
    return this.redoStack.length;
  }

  get memoryUsage(): number {
    return this.currentMemorySize;
  }

  get maxMemory(): number {
    return this.maxMemorySize;
  }

  private commandSize(command: Command): number {
    return command.getSize?.() ?? 256;
  }

  private pushToUndo(command: Command): void {
    const size = this.commandSize(command);
    this.undoStack.push(command);
    this.currentMemorySize += size;
    this.redoStack = [];
    this.evictIfNeeded();
  }

  private evictIfNeeded(): void {
    while (
      (this.currentMemorySize > this.maxMemorySize ||
        this.undoStack.length > this.maxStack) &&
      this.undoStack.length > 0
    ) {
      const oldest = this.undoStack.shift()!;
      this.currentMemorySize -= this.commandSize(oldest);
    }
    if (this.currentMemorySize < 0) this.currentMemorySize = 0;
  }

  /** 尝试与栈顶 Command 合并，成功则不入新栈 */
  tryMerge(command: Command): boolean {
    const last = this.undoStack[this.undoStack.length - 1];
    if (!last?.tryMerge) return false;
    if (!last.tryMerge(command)) return false;
    const oldSize = this.commandSize(last);
    // 合并后必须重新 execute，否则 store 不会应用最新的 after 几何
    last.execute();
    const newSize = this.commandSize(last);
    this.currentMemorySize += newSize - oldSize;
    if (this.currentMemorySize < 0) this.currentMemorySize = 0;
    this.redoStack = [];
    return true;
  }

  execute(command: Command): void {
    command.execute();
    this.pushToUndo(command);
  }

  /** 仅压栈、不执行（Transaction commit 或外部已应用） */
  push(command: Command): void {
    this.pushToUndo(command);
  }

  undo(): boolean {
    const command = this.undoStack.pop();
    if (!command) return false;
    this.currentMemorySize -= this.commandSize(command);
    if (this.currentMemorySize < 0) this.currentMemorySize = 0;
    command.undo();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.pop();
    if (!command) return false;
    command.execute();
    this.undoStack.push(command);
    this.currentMemorySize += this.commandSize(command);
    this.evictIfNeeded();
    return true;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.currentMemorySize = 0;
  }

  peekUndoName(): string | null {
    const top = this.undoStack[this.undoStack.length - 1];
    return top?.name ?? null;
  }

  debug(): HistoryDebugInfo {
    const recent = this.undoStack.slice(-5).map((c) => c.name);
    return {
      undoSize: this.undoStack.length,
      redoSize: this.redoStack.length,
      memoryBytes: this.currentMemorySize,
      maxMemoryBytes: this.maxMemorySize,
      maxStack: this.maxStack,
      lastCommand: this.peekUndoName(),
      recentCommands: recent,
    };
  }
}
