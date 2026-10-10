/**
 * canonical-json 的类型面。
 *
 * 本文件与 `index.js` 的导出名由 `test/type-surface.test.js` **机械对账**：
 * 只有 JS 里存在的导出才允许出现在这里（反之亦然）。类型是接口契约，
 * 而契约与实现漂移是 JS 库最常见的静默缺陷。
 */

/** JSON 能表达的值。 */
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

/** 错误码（与运行时 `ERROR_CODES` 的取值一一对应）。 */
export type CanonicalJsonErrorCode =
  | 'NOT_JSON'
  | 'UNDEFINED'
  | 'NON_FINITE_NUMBER'
  | 'CYCLE'
  | 'NOT_PLAIN_OBJECT'
  | 'TOO_DEEP'
  | 'NO_WEBCRYPTO';

/** 运行时导出的错误码常量表（冻结对象）。 */
export declare const ERROR_CODES: Readonly<{
  NOT_JSON: 'NOT_JSON';
  UNDEFINED: 'UNDEFINED';
  NON_FINITE_NUMBER: 'NON_FINITE_NUMBER';
  CYCLE: 'CYCLE';
  NOT_PLAIN_OBJECT: 'NOT_PLAIN_OBJECT';
  TOO_DEEP: 'TOO_DEEP';
  NO_WEBCRYPTO: 'NO_WEBCRYPTO';
}>;

/** 默认深度上限。 */
export declare const DEFAULT_MAX_DEPTH: number;

export interface CanonicalizeOptions {
  /** 深度上限，默认 512；超限抛 CanonicalJsonError（code: TOO_DEEP）。 */
  maxDepth?: number;
}

/** 规范化过程中的错误；`path` 是 JSON 指针风格的位置，`code` 见 ERROR_CODES。 */
export declare class CanonicalJsonError extends Error {
  readonly name: 'CanonicalJsonError';
  readonly code: CanonicalJsonErrorCode;
  readonly path: string;
  constructor(message: string, path: string, code: CanonicalJsonErrorCode);
}

/**
 * 序列化为规范 JSON 字符串。
 *
 * 输入类型是 `unknown`：本函数是**运行时校验器**，非 JSON 值会抛错，
 * 而不是被静默丢弃。
 */
export declare function canonicalize(value: unknown, options?: CanonicalizeOptions): string;

/** 规范形式对应的 UTF-8 字节。 */
export declare function canonicalBytes(value: unknown, options?: CanonicalizeOptions): Uint8Array;

/** 规范形式的 SHA-256（小写十六进制，WebCrypto）。 */
export declare function canonicalHash(value: unknown, options?: CanonicalizeOptions): Promise<string>;

/** 判断文本是否已经是规范形式（非法 JSON 返回 false）。 */
export declare function isCanonical(text: unknown): boolean;
