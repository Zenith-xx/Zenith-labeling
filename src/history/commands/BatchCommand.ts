import type { Command } from '../command';

const BATCH_OVERHEAD = 128;

/**
 * 批量 Command：一次 Undo 恢复整组操作。
 * 用于批量删除、移动、改标签、复制及 Transaction 提交。
 */
export class BatchCommand implements Command {
  readonly name: string;

  constructor(
    private readonly commands: Command[],
    label = 'BATCH'
  ) {
    this.name = label.startsWith('BATCH') ? label : `BATCH:${label}`;
  }

  get subCommands(): readonly Command[] {
    return this.commands;
  }

  execute(): void {
    for (const cmd of this.commands) {
      cmd.execute();
    }
  }

  undo(): void {
    for (let i = this.commands.length - 1; i >= 0; i--) {
      this.commands[i].undo();
    }
  }

  getSize(): number {
    return (
      BATCH_OVERHEAD +
      this.commands.reduce((sum, c) => sum + (c.getSize?.() ?? 256), 0)
    );
  }
}
