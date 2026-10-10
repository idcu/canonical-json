# canonical-json

**确定性 JSON 序列化与哈希：同一个值，永远是同一串字节。**

零依赖。没有构建步骤——仓库里提交什么，别人 vendored 之后跑的就是什么。

```js
import { canonicalize, canonicalHash } from '@idcu/canonical-json';

canonicalize({ b: 1, a: 2 });          // '{"a":2,"b":1}'
canonicalize({ a: 2, b: 1 });          // '{"a":2,"b":1}'   ← 同一个值，同一串字节
await canonicalHash({ b: [2, 3], a: 1 });
// 'efbd0040190fb0871831e606c581f8a66db79d8e2bb836745a70051306956070'
```

## 为什么需要它

`JSON.stringify` 的输出取决于**键的插入顺序**：`{a:1,b:2}` 与 `{b:2,a:1}` 是同一个值、
两串字节。凡是拿这些字节去做缓存键、内容哈希、签名或"能不能复现"的判断，
这个差别就是缺陷的来源——而且它**平时不显形**，只在两台机器给出不同摘要时才暴露。

本库把"规范化形式"定死，并把不满足条件的输入**报错**（而不是静默改写）。

## 安装

**作为 Git 依赖（ngm）**——本仓库带 `ngm.json`，入口直接可解析：

```jsonc
// 你的 ngm.json
{
  "dependencies": [
    { "name": "github:idcu/canonical-json", "ref": "v1.0.0", "refType": "tag" }
  ]
}
```

```bash
ngm install
ngm mappings          # 入口（main/types）会被自动推断出来
```

**其他包管理器 / 运行时**：仓库就是产物（`src/index.js` + `src/index.d.ts`），
`package.json` 的 `exports` 已把入口与类型指好；Node 20+、Deno、浏览器都可用
（哈希走 `globalThis.crypto.subtle`）。

## API

| 导出 | 说明 |
|------|------|
| `canonicalize(value, options?)` | 规范 JSON 字符串。不可表示的值抛 `CanonicalJsonError` |
| `canonicalBytes(value, options?)` | 规范形式的 UTF-8 字节（`Uint8Array`） |
| `canonicalHash(value, options?)` | 规范形式的 SHA-256（小写十六进制，`Promise<string>`） |
| `isCanonical(text)` | 文本是否**已经是**规范形式（非法 JSON 返回 `false`，不抛） |
| `CanonicalJsonError` | 错误类型：带 `code` 与 `path`（JSON 指针风格） |
| `ERROR_CODES` / `DEFAULT_MAX_DEPTH` | 错误码常量表 / 默认深度上限（512） |

`options.maxDepth` 可调深度上限（正整数的上限才是上限；非法值直接报错）。

## 确定性规则（逐条可核对）

| # | 规则 |
|---|------|
| 1 | 对象键按 **UTF-16 code unit 升序**（ECMAScript 默认排序；与语言环境无关） |
| 2 | 无多余空白：`{"a":1}` |
| 3 | 字符串用最小转义（`JSON.stringify` 同款，规范定义） |
| 4 | 数字按 `Number::toString`（`-0` → `0`，`1e21` → `1e+21`） |
| 5 | 只接受 JSON 能表达的值；其余**报错**（见下） |
| 6 | 深度上限默认 512，超限报 `TOO_DEEP`（不栈溢出） |

**明确拒绝**（而不是静默丢弃或改写）：`undefined`、函数、`Symbol`、`BigInt`、
`NaN` / `±Infinity`、类实例 / `Date` / `Map`、循环引用。

## 明确不做

- **不调用 `toJSON()`**：它允许对象自行改写序列化结果，与"同一份数据 ⇒ 同一份字节"
  直接冲突。需要那种行为请先自己把值规范化成普通对象。
- **不读 getter 以外的语义**：取值时会触发 getter（与 `JSON.stringify` 相同）——
  规范形式是**取值那一刻的快照**；有副作用或每次返回不同的 getter 是调用方的责任。
- **不做多算法**：只提供 SHA-256。窄接口是刻意的——需要别的算法时应当显式引入别的库。

## 测试与自检

```bash
npm test        # 即 node --test（内置 test runner，零依赖）
```

其中三组值得单独说：

- `test/hash.test.js`：把 WebCrypto 的结果与 `node:crypto` **逐字节对账**，并钉一个
  跨机器不变的已知向量；
- `test/type-surface.test.js`：`index.d.ts` 与实现的导出名**双向对账**（类型面漂移是
  JS 库最常见的静默缺陷），并检查 `package.json` 的入口指向真实文件；
- `test/errors.test.js`：每个"拒绝"路径都带着 `code` 与 `path`。

**对照 ngm 的库标准**（在 ngm 仓库里）：

```bash
bash scripts/check-library-standard.sh /path/to/canonical-json --strict
```

本库是按 [JS Git 库的标准](../../ngm/docs/guides/js-git-library-standard.md) 写的：
必做项全绿是设计目标，不是事后补齐。

## 发布

1. 改 `package.json` 与 `ngm.json` 的 `version`（两处必须一致）；
2. 提交；
3. 打附注 tag：`git tag -a v1.0.0 -m "v1.0.0 — canonical-json 首个版本"`；
4. `git push && git push --tags`。

**tag 不可变**：一旦有下游把它锁进 lock 文件，移动 tag 就会被判为漂移。

## 许可

MIT（见 [LICENSE](./LICENSE)）。
