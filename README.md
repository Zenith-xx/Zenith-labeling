# Zenith-labeling

基于 **Vue 3 + TypeScript** 的本地图像标注工具。数据保存在浏览器本机，支持多种标注格式导入导出，并可配合 Labeling-Server 进行 AI 辅助标注。

## 功能特性

- 矩形、OBB、多边形、关键点标注
- 数据集文件夹导入（图片 + JSON 标注）
- YOLO / COCO / VOC 格式导入与导出
- 撤销重做、复制粘贴、标签快捷键
- AI 自动标注（需配合后端 Labeling-Server）

## 快速开始

### 环境要求

- Node.js 18+

### 安装与启动

```bash
npm install
npm run dev
```

浏览器访问 http://localhost:5173

### 生产构建

```bash
npm run build
npm run preview   # 本地预览构建结果
```

| 变量 | 说明 |
|------|------|
| `VITE_LABELING_SERVER_URL` | 生产环境 API 地址（默认 `http://localhost:8100`） |

```powershell
$env:VITE_LABELING_SERVER_URL = "http://192.168.1.100:8100"
npm run build
```

## AI 标注（可选）

开发模式下，AI 请求通过 `/labeling-api` 代理到 `127.0.0.1:8100`。使用前需先启动 Labeling-Server 后端，并在前端「AI 模型设置」中配置 API Token。

## 常用命令

```bash
npm run test        # 单元测试
npm run typecheck   # 类型检查
npm run verify      # 测试 + 类型检查 + 构建
```

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

## 技术栈

Vue 3 · TypeScript · Vite · Pinia · Konva · Ant Design Vue

## 目录结构

| 路径 | 说明 |
|------|------|
| `src/views` | 标注工作区页面 |
| `src/components/Canvas` | 画布与标注交互 |
| `src/stores` | 状态管理 |
| `src/importer` | 数据集导入 |
| `src/features/aiTask` | AI 标注任务 |

## License

MIT
