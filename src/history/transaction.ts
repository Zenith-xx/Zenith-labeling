import type { Command } from './command';
import { BatchCommand } from './commands/BatchCommand';

export interface ActiveTransaction {
  name: string;
  commands: Command[];
  depth: number;
}

let activeTransaction: ActiveTransaction | null = null;

export function isInTransaction(): boolean {
  return activeTransaction !== null;
}

export function getActiveTransaction(): ActiveTransaction | null {
  return activeTransaction;
}

/** 开启事务；已处于事务中时仅增加嵌套深度，不重复创建 */
export function beginTransaction(name: string): void {
  if (activeTransaction) {
    activeTransaction.depth += 1;
    return;
  }
  activeTransaction = { name, commands: [], depth: 1 };
}

export function cancelTransaction(): void {
  if (!activeTransaction) return;
  for (let i = activeTransaction.commands.length - 1; i >= 0; i--) {
    activeTransaction.commands[i].undo();
  }
  activeTransaction = null;
}

/**
 * 结束事务并返回应入 History 栈的 Command。
 * 嵌套时仅在最外层 depth 归零时提交。
 */
export function commitTransaction(): Command | null {
  if (!activeTransaction) return null;
  activeTransaction.depth -= 1;
  if (activeTransaction.depth > 0) return null;

  const { name, commands } = activeTransaction;
  activeTransaction = null;

  if (commands.length === 0) return null;
  if (commands.length === 1) return commands[0];
  return new BatchCommand(commands, name);
}

/** 事务进行中：执行并收集，不入主栈 */
export function recordTransactionCommand(command: Command): void {
  if (!activeTransaction) {
    throw new Error('[HistoryTransaction] no active transaction');
  }
  command.execute();
  activeTransaction.commands.push(command);
}
