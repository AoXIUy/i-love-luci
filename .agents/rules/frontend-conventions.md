# 前端开发防错与代码规范 (Frontend Conventions)

---

## 1. 国际化字典防重复键 (`i18n.ts`)
- 凡修改 `src/lib/i18n.ts`，添加任何英文 key 之前，必须在文件中全文检索 `"<Key>":`。
- 绝不允许在同一个 `dict` 对象字面量中出现重复的键名（防止 TypeScript `TS1117` 编译错误）。
- 通用键如 `Target`, `Device`, `State`, `Status`, `Source`, `Metric`, `Protocol`, `Search`, `Action` 等属于全局基础词汇，必须复用顶部声明，禁止按功能页面就地重复定义。

## 2. 单体大文件防重复函数定义 (`native-page.tsx`)
- 在长单体文件中编写辅助函数（如数据格式化、字符串解析、常用小组件）前，必须全局搜索是否存在已有函数。
- 禁止二次声明 `formatBytes`, `formatDuration`, `parse*` 等函数（防止 `TS2393` 重复定义）。
- 如需支持更多入参格式，在原函数位置做类型联合拓宽（如 `value?: number | string`）。

## 3. RPC 跨层契约字段强绑定 (`rpc.ts`)
- 后端 `i-love-luci.uc` 返回新字段时，`src/lib/rpc.ts` 中对应的 `NativePageData` / 响应结构体必须在第一时间显式添加该字段（防止 `TS2339`）。
- 前端组件禁止在未扩展 `rpc.ts` 类型定义的情况下直接读取新属性。
