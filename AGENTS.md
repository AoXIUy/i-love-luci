# I Love LuCI 开发规范与防错准则 (Workspace Rules)

本规则集用于约束项目开发中的常见高发错误，确保代码在各平台环境下的构建一致性与类型安全。

---

## 1. 国际化字典 (`i18n.ts`) 查重准则 (防止 TS1117)
- **绝对禁止声明重复键**：向 `i18n.ts` 的 `dict` 对象添加任何词条前，**必须先搜索全文**确认该英文 key 是否已被定义。
- **通用属性名共享**：常见属性名词（如 `Target`, `Device`, `State`, `Status`, `Source`, `Metric`, `Protocol`, `Search`, `Action`, `Time`, `Interface`, `Type` 等）已在全局区域统一定义，新增模块时直接复用 `t("...")`，严禁在模块小节中重复添加同名字段。
- **差异语义命名**：若同一单词在不同语境下语义完全不同（例如 `Target` 表示目标网段 vs 架构平台），使用更具体的键名（如 `Target architecture` vs `Target`）或在通用词条中采用兼顾翻译（如 `目标 / 架构`）。

---

## 2. 大型单体文件 (`native-page.tsx` 等) 防重复声明准则 (防止 TS2393)
- **新增函数前全局检索**：在超过 1000 行的大型单体文件中新增或修改辅助函数（如 `format*`, `parse*`, `*Badge`, `*Table`, `*Dialog`, `*Select` 等）前，**必须先执行全文搜索**。
- **优先复用与多态扩展**：
  - 若已存在同名或同功能函数（如 `formatBytes`, `formatDuration`, `parseSimpleLines`），必须优先直接调用已有实现。
  - 若需要支持新的参数类型（如 `formatBytes` 既要支持 `number` 又要支持 `string`），应将现有函数升级为多态实现（如 `(value?: number | string) => ...`），**严禁在下方重新声明同名函数**。
- **自包含组件命名**：若组件仅服务于特定子模块，建议在命名上附带模块前缀（如 `NftChainTable`、`UpnpdRuleTable`），避免与全局/通用组件命名冲突。

---

## 3. 全链路 RPC 数据契约同步准则 (防止 TS2339)
- **三端定义强制同步**：
  1. **后端 ucode (`i-love-luci.uc`)**：`native_page` 或 RPC 方法返回新字段时；
  2. **前端 RPC 类型层 (`rpc.ts`)**：**必须同步**在对应的 TypeScript interface / type（如 `NativePageData`, `CommandBlock`, `ConntrackSummary` 等）中声明该字段及其可选修饰符（如 `conntrack?: ConntrackSummary`）；
  3. **前端 UI 组件 (`*.tsx`)**：方可使用该字段。
- **禁止未声明属性访问**：严格模式下访问未声明属性必然导致 `tsc` 编译中断，修改数据流必须以 `rpc.ts` 为核心契约基准。

---

## 4. 兼容性与架构规范 (Compatibility Contract)
- **禁止 `<pre>` 标签**：`frontend/shell/src/` 下严禁使用 `<pre>` 标签，命令输出与日志必须使用结构化表格、`<code>` 或带有 `font-mono whitespace-pre-wrap` 的 `<div>`。
- **无状态组件规范**：必须使用 TypeScript 严格模式、函数组件与 React Hooks，禁止使用 class 组件。
- **Tailwind CSS v4**：样式必须使用 Tailwind 原子类，禁止引入额外的外部重量级 CSS 依赖。
- **错误捕获与反馈**：所有 RPC 异步调用必须处理异常并弹出 `toast.error()`，不可抛出未捕获 Promise Rejection。
