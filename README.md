# Labeling-vue3 前端

Vue 3 + TypeScript 标注 SPA。数据存于本机，详见 [项目总说明](../README.md)。

## 启动

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # 产出 dist/
npm run preview      # 预览构建结果
```

开发时 AI 请求走 `/labeling-api` 代理到 `127.0.0.1:8100`，需先启动 [Labeling-Server](../Labeling-Server/README.md)。

## 生产构建

| 变量 | 说明 |
|------|------|
| `VITE_LABELING_SERVER_URL` | 生产环境 API 地址（默认 `http://localhost:8100`） |

```powershell
$env:VITE_LABELING_SERVER_URL = "http://192.168.1.100:8100"
npm run build
```

## 常用命令

`npm run test` · `npm run typecheck` · `npm run verify`

## 快捷键

| 按键 | 作用 |
|------|------|
| `R` / `B` / `P` / `O` | 矩形 / OBB / 多边形 / 点 |
| `A` / `D` | 上一张 / 下一张 |
| `Ctrl+Z` / `Ctrl+Y` | 撤销 / 重做 |
| `Ctrl+C` / `Ctrl+V` / `Ctrl+D` | 复制 / 粘贴 / 复制并偏移 |
| `Ctrl+L` | 显示/隐藏标签 |
| `Esc` | 取消选择 |
| `1`–`9` | 快速选标签 |

## 源码目录

`src/views` 工作区 · `components/Canvas` 画布 · `stores` 状态 · `importer` 导入 · `features/aiTask` AI 任务
