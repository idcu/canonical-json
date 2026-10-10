/**
 * canonical-json —— 确定性 JSON 序列化与哈希：**同一个值，永远是同一串字节**。
 *
 * 为什么需要它：`JSON.stringify` 的输出取决于**键的插入顺序**——
 * `{a:1,b:2}` 与 `{b:2,a:1}` 是同一个值、两串字节。凡是要把这些字节用于
 * 缓存键、内容哈希、签名或"能不能复现"的判断，这个差别就是缺陷源。
 *
 * 本模块把"规范化形式"定死（规则见 README §确定性规则，逐条可核对）：
 *
 *   1. 对象键按 **UTF-16 code unit 升序**（`Array.prototype.sort` 的默认序，
 *      跨平台确定，与语言环境无关）；
 *   2. 无任何多余空白（`{"a":1}`，不是 `{ "a": 1 }`）；
 *   3. 字符串用 `JSON.stringify` 的最小转义（ECMAScript 规范定义，确定）；
 *   4. 数字按 ECMAScript 的 Number::toString（`JSON.stringify` 同款；
 *      `-0` → `0`，`1e21` → `1e+21`）；
 *   5. **只接受 JSON 能表达的值**：`undefined` / 函数 / Symbol / BigInt /
 *      NaN / ±Infinity / 类实例 / 循环引用一律**报错**，而不是静默丢弃或改写。
 *      特别地：**不调用 `toJSON()`**——它允许对象自行改写序列化结果，
 *      与"同一份数据 ⇒ 同一份字节"直接冲突。
 *   6. 深度上限默认 512（可用 `maxDepth` 调），超限报错——
 *      递归实现遇到敌意输入应当给出可读错误，而不是栈溢出。
 *
 * 本文件就是**运行的那份代码**（没有构建步骤、没有 dist）：仓库里提交什么，
 * 用户 vendored 之后跑的就是什么。类型面在同目录的 `index.d.ts` 里，
 * 两者的导出名由 `test/type-surface.test.js` 机械对账。
 */

/** 错误码，便于调用方分支处理。 */
export const ERROR_CODES = Object.freeze({
  NOT_JSON: 'NOT_JSON',
  UNDEFINED: 'UNDEFINED',
  NON_FINITE_NUMBER: 'NON_FINITE_NUMBER',
  CYCLE: 'CYCLE',
  NOT_PLAIN_OBJECT: 'NOT_PLAIN_OBJECT',
  TOO_DEEP: 'TOO_DEEP',
  NO_WEBCRYPTO: 'NO_WEBCRYPTO',
});

/** 默认深度上限（见文件头第 6 条）。 */
export const DEFAULT_MAX_DEPTH = 512;

/** 规范化过程中的错误：带 `path`（JSON 指针风格）与 `code`。 */
export class CanonicalJsonError extends Error {
  /**
   * @param {string} message 人能读的说明
   * @param {string} path 出错位置，如 `$.items[2].id`
   * @param {string} code ERROR_CODES 之一
   */
  constructor(message, path, code) {
    super(`${message} (at ${path})`);
    this.name = 'CanonicalJsonError';
    this.path = path;
    this.code = code;
  }
}

/**
 * 把值序列化为**规范 JSON 字符串**。
 *
 * @param {unknown} value 任意值；不可表示为 JSON 时抛出 CanonicalJsonError
 * @param {{maxDepth?: number}} [options]
 * @returns {string}
 */
export function canonicalize(value, options = {}) {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (!Number.isInteger(maxDepth) || maxDepth < 1) {
    throw new CanonicalJsonError('maxDepth must be a positive integer', '$', ERROR_CODES.NOT_JSON);
  }
  return write(value, '$', 0, maxDepth, new Set());
}

/**
 * 规范形式对应的 UTF-8 字节。
 *
 * @param {unknown} value
 * @param {{maxDepth?: number}} [options]
 * @returns {Uint8Array}
 */
export function canonicalBytes(value, options = {}) {
  return new TextEncoder().encode(canonicalize(value, options));
}

/**
 * 规范形式的 SHA-256（小写十六进制）。
 *
 * 用 WebCrypto（Node 20+ / Deno / 浏览器都提供 `globalThis.crypto.subtle`）——
 * **不引入任何依赖**。缺 WebCrypto 时明确报错，而不是悄悄换成别的实现。
 *
 * @param {unknown} value
 * @param {{maxDepth?: number}} [options]
 * @returns {Promise<string>}
 */
export async function canonicalHash(value, options = {}) {
  const bytes = canonicalBytes(value, options);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new CanonicalJsonError(
      'WebCrypto is required (globalThis.crypto.subtle); Node 20+, Deno and browsers provide it',
      '$',
      ERROR_CODES.NO_WEBCRYPTO,
    );
  }
  const digest = await subtle.digest('SHA-256', bytes);
  let out = '';
  for (const b of new Uint8Array(digest)) out += b.toString(16).padStart(2, '0');
  return out;
}

/**
 * 判断一段文本是否**已经是**规范形式。
 *
 * 用途：校验落盘的产物（缓存文件、签名前的字节、lock 类文件）没有被
 * 手工编辑或别的工具重新排版过。非法 JSON 返回 `false`（不抛）。
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function isCanonical(text) {
  if (typeof text !== 'string') return false;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return false;
  }
  try {
    return canonicalize(parsed) === text;
  } catch {
    return false;
  }
}

// ---- 内部实现 --------------------------------------------------------

function write(value, path, depth, maxDepth, seen) {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(value)) {
        throw new CanonicalJsonError(
          `non-finite number ${String(value)} cannot be represented in JSON`,
          path,
          ERROR_CODES.NON_FINITE_NUMBER,
        );
      }
      return JSON.stringify(value);
    case 'string':
      return JSON.stringify(value);
    case 'object':
      break;
    default:
      throw new CanonicalJsonError(`${typeof value} cannot be represented in JSON`, path, ERROR_CODES.NOT_JSON);
  }

  if (depth >= maxDepth) {
    throw new CanonicalJsonError(
      `value is deeper than maxDepth (${maxDepth})`,
      path,
      ERROR_CODES.TOO_DEEP,
    );
  }
  if (seen.has(value)) {
    throw new CanonicalJsonError('circular reference', path, ERROR_CODES.CYCLE);
  }
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      const parts = [];
      for (let i = 0; i < value.length; i++) {
        parts.push(write(value[i], `${path}[${i}]`, depth + 1, maxDepth, seen));
      }
      return `[${parts.join(',')}]`;
    }

    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) {
      throw new CanonicalJsonError(
        `only plain objects are allowed (got ${describe(value)}); toJSON() is deliberately not called`,
        path,
        ERROR_CODES.NOT_PLAIN_OBJECT,
      );
    }

    // 默认比较即 UTF-16 code unit 序（规则 1）；不传 comparator，
    // 任何"看起来更聪明"的排序都会引入语言环境/本地化的不确定。
    const keys = Object.keys(value).sort();
    const parts = [];
    for (const key of keys) {
      const item = value[key];
      if (item === undefined) {
        throw new CanonicalJsonError(
          'undefined cannot be represented in JSON (omit the key instead)',
          `${path}.${key}`,
          ERROR_CODES.UNDEFINED,
        );
      }
      parts.push(`${JSON.stringify(key)}:${write(item, `${path}.${key}`, depth + 1, maxDepth, seen)}`);
    }
    return `{${parts.join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function describe(value) {
  const ctor = value.constructor?.name;
  if (ctor && ctor !== 'Object') return ctor;
  return Array.isArray(value) ? 'Array' : 'object';
}
