/**
 * 命令模式接口。
 * 只记录操作差分，不拷贝整图 annotations。
 */
export interface Command {
  readonly name: string;
  execute(): void;
  undo(): void;
  /** 估算本条 Command 占用的内存（字节），用于 History 内存上限 */
  getSize?(): number;
  /**
   * 尝试与下一条同类型 Command 合并（如连续拖动只保留一条 Move）。
   * 返回 true 表示已合并，不再单独入栈。
   */
  tryMerge?(next: Command): boolean;
}
