/** 顶部互斥悬停下拉的打开状态（支持函数式更新，避免关菜单时误伤已切换的菜单） */
export type MenuOpenChange = (
  next: string | null | ((prev: string | null) => string | null)
) => void;
