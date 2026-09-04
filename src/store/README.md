# Store 入口约定

## 对外导入路径

组件与业务逻辑请使用 **`@/store/use*Store`**：

| Store | 导入 |
|-------|------|
| 标注 / 项目 / 历史 | `@/store/useAnnotationStore`、`useProjectStore`、`useHistoryStore` |
| AI 任务 | `@/store/useAiTaskStore` |
| 模型 / 推理 | `@/store/useModelStore`、`@/store/useInferenceStore` |
| 主题 / 导入 | `@/store/useThemeStore`、`useImportStore` |

`@/features/modelCenter/modelStore` 与 `@/features/ai` 仍可从 feature 再导出，但**组件层优先 `@/store/`**。

## 架构说明

- `src/stores/*.ts`：基于 `zustandCompat` 的 vanilla store（`getState` / `setState`）
- `src/store/use*Store.ts`：通过 `piniaBridge` 暴露给 Vue 的 `useXStore()`
- `src/stores/annotation/`：`types.ts`（类型）、`helpers.ts`（纯函数），主逻辑在 `annotation.ts`

命令、画布、测试等 imperative 代码可直接 `useAnnotationStore.getState()`。

## 请勿

- 在组件中直接 `import from '../stores/annotation'`（应走 `@/store/`）
- 在 `features/` 内混用相对路径 `../../stores/`（应走 `@/store/` 或 feature 门面）
