/**
 * The string expression language, for configs that arrive as JSON.
 *
 * A JSON config cannot carry a callback, so expressions may also be written as
 * strings — `{ "$expr": "!model.value.address.country" }`. Those strings are
 * **untrusted input**: they come from wherever the config comes from. So they
 * are never compiled to JavaScript (`eval` / `new Function` would be remote
 * code execution, and is blocked by CSP for exactly that reason). They are
 * parsed into a small AST and interpreted here.
 *
 * What the grammar can express is the whole security boundary: reading fields
 * off the expression context, comparing and combining them, and calling a
 * fixed list of pure, non-mutating methods. There is no node for assignment,
 * `new`, or reaching a global — no expression can name `window`, `fetch` or
 * `constructor`, whatever it contains.
 *
 * Member access never throws: `model.value.a.b` where `a` is missing yields
 * `undefined` rather than a TypeError, since JSON authors cannot be expected
 * to write `?.` at every step. A malformed *expression*, by contrast, throws
 * loudly — that is a broken config, not a runtime state.
 */

/* ------------------------------------------------------------------ *
 * Tokenizer
 * ------------------------------------------------------------------ */

type TokenType = "num" | "str" | "ident" | "punct" | "eof";

interface Token {
  type: TokenType;
  value: string;
  /** Decoded value for literals. */
  literal?: unknown;
  pos: number;
}

// Longest first: "===" must win over "==", "?." over "?".
const PUNCTUATORS = [
  "===",
  "!==",
  "??",
  "?.",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "(",
  ")",
  "[",
  "]",
  ".",
  ",",
  "?",
  ":",
  "!",
  "<",
  ">",
  "+",
  "-",
  "*",
  "/",
  "%",
];

const IDENT_START = /[A-Za-z_$]/;
const IDENT_PART = /[A-Za-z0-9_$]/;
const DIGIT = /[0-9]/;

class ExpressionSyntaxError extends Error {
  constructor(source: string, pos: number, message: string) {
    super(
      `[preact-signal-formly] Invalid expression ${JSON.stringify(source)}: ${message} (at ${pos}).`,
    );
    this.name = "ExpressionSyntaxError";
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const char = source[i] as string;

    if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      i++;
      continue;
    }

    if (char === '"' || char === "'") {
      const start = i;
      const quote = char;
      let out = "";
      i++;
      while (i < source.length && source[i] !== quote) {
        if (source[i] === "\\") {
          const next = source[i + 1];
          if (next === undefined) break;
          out += next === "n" ? "\n" : next === "t" ? "\t" : next;
          i += 2;
          continue;
        }
        out += source[i];
        i++;
      }
      if (i >= source.length) throw new ExpressionSyntaxError(source, start, "unterminated string");
      i++; // closing quote
      tokens.push({ type: "str", value: out, literal: out, pos: start });
      continue;
    }

    if (DIGIT.test(char) || (char === "." && DIGIT.test(source[i + 1] ?? ""))) {
      const start = i;
      while (i < source.length && DIGIT.test(source[i] as string)) i++;
      if (source[i] === ".") {
        i++;
        while (i < source.length && DIGIT.test(source[i] as string)) i++;
      }
      const raw = source.slice(start, i);
      tokens.push({ type: "num", value: raw, literal: Number(raw), pos: start });
      continue;
    }

    if (IDENT_START.test(char)) {
      const start = i;
      while (i < source.length && IDENT_PART.test(source[i] as string)) i++;
      tokens.push({ type: "ident", value: source.slice(start, i), pos: start });
      continue;
    }

    const punct = PUNCTUATORS.find((p) => source.startsWith(p, i));
    if (punct) {
      tokens.push({ type: "punct", value: punct, pos: i });
      i += punct.length;
      continue;
    }

    throw new ExpressionSyntaxError(source, i, `unexpected character ${JSON.stringify(char)}`);
  }

  tokens.push({ type: "eof", value: "", pos: source.length });
  return tokens;
}

/* ------------------------------------------------------------------ *
 * AST
 * ------------------------------------------------------------------ */

export type ExprNode =
  | { kind: "literal"; value: unknown }
  | { kind: "root"; name: string }
  | { kind: "member"; object: ExprNode; property: ExprNode; computed: boolean }
  | { kind: "call"; object: ExprNode; method: string; args: ExprNode[] }
  | { kind: "unary"; operator: "!" | "-"; argument: ExprNode }
  | { kind: "binary"; operator: string; left: ExprNode; right: ExprNode }
  | { kind: "logical"; operator: "&&" | "||" | "??"; left: ExprNode; right: ExprNode }
  | { kind: "conditional"; test: ExprNode; consequent: ExprNode; alternate: ExprNode };

/** Identifiers an expression may start from — the expression context. */
export const EXPRESSION_ROOTS = ["model", "formState", "field", "namePath"] as const;

// Maps, not object literals: a lookup keyed by attacker-chosen text must not
// walk `Object.prototype`. `KEYWORD_LITERALS["constructor"]` on a plain object
// would hand back `Object` itself.
const KEYWORD_LITERALS = new Map<string, unknown>([
  ["true", true],
  ["false", false],
  ["null", null],
  ["undefined", undefined],
]);

/** Binary precedence, loosest first. `??`/`||`/`&&` are handled as logical. */
const BINARY_PRECEDENCE = new Map<string, number>([
  ["===", 4],
  ["!==", 4],
  ["==", 4],
  ["!=", 4],
  ["<", 5],
  [">", 5],
  ["<=", 5],
  [">=", 5],
  ["+", 6],
  ["-", 6],
  ["*", 7],
  ["/", 7],
  ["%", 7],
]);

const LOGICAL_PRECEDENCE = new Map<string, number>([
  ["??", 1],
  ["||", 2],
  ["&&", 3],
]);

/* ------------------------------------------------------------------ *
 * Parser
 * ------------------------------------------------------------------ */

function parse(source: string): ExprNode {
  const tokens = tokenize(source);
  let index = 0;

  const peek = (): Token => tokens[index] as Token;
  const fail = (message: string): never => {
    throw new ExpressionSyntaxError(source, peek().pos, message);
  };
  const eat = (value: string): boolean => {
    const token = peek();
    if (token.type === "punct" && token.value === value) {
      index++;
      return true;
    }
    return false;
  };
  const expect = (value: string): void => {
    if (!eat(value)) fail(`expected ${JSON.stringify(value)}`);
  };

  function parsePrimary(): ExprNode {
    const token = peek();

    if (token.type === "num" || token.type === "str") {
      index++;
      return { kind: "literal", value: token.literal };
    }

    if (token.type === "ident") {
      index++;
      if (KEYWORD_LITERALS.has(token.value)) {
        return { kind: "literal", value: KEYWORD_LITERALS.get(token.value) };
      }
      if (!(EXPRESSION_ROOTS as readonly string[]).includes(token.value)) {
        throw new ExpressionSyntaxError(
          source,
          token.pos,
          `unknown identifier ${JSON.stringify(token.value)} — an expression may only start from ${EXPRESSION_ROOTS.join(", ")}`,
        );
      }
      return { kind: "root", name: token.value };
    }

    if (eat("(")) {
      const inner = parseExpressionNode();
      expect(")");
      return inner;
    }

    return fail(
      `unexpected ${token.type === "eof" ? "end of expression" : JSON.stringify(token.value)}`,
    );
  }

  /** Member access, indexing and method calls — all left-associative. */
  function parsePostfix(): ExprNode {
    let node = parsePrimary();

    for (;;) {
      if (eat(".") || eat("?.")) {
        const token = peek();
        if (token.type !== "ident") fail("expected a property name after '.'");
        index++;
        // `foo.bar(...)` is a method call; `foo.bar` is a property read.
        if (peek().type === "punct" && peek().value === "(") {
          index++;
          const args: ExprNode[] = [];
          if (!eat(")")) {
            do {
              args.push(parseExpressionNode());
            } while (eat(","));
            expect(")");
          }
          node = { kind: "call", object: node, method: token.value, args };
          continue;
        }
        node = {
          kind: "member",
          object: node,
          property: { kind: "literal", value: token.value },
          computed: false,
        };
        continue;
      }

      if (eat("[")) {
        const property = parseExpressionNode();
        expect("]");
        node = { kind: "member", object: node, property, computed: true };
        continue;
      }

      if (peek().type === "punct" && peek().value === "(") {
        fail("only method calls are allowed — a value cannot be called");
      }

      return node;
    }
  }

  function parseUnary(): ExprNode {
    if (eat("!")) return { kind: "unary", operator: "!", argument: parseUnary() };
    if (eat("-")) return { kind: "unary", operator: "-", argument: parseUnary() };
    return parsePostfix();
  }

  function parseBinary(minPrecedence: number): ExprNode {
    let left = parseUnary();

    for (;;) {
      const token = peek();
      if (token.type !== "punct") return left;

      const logical = LOGICAL_PRECEDENCE.get(token.value);
      if (logical !== undefined) {
        if (logical < minPrecedence) return left;
        index++;
        const right = parseBinary(logical + 1);
        left = { kind: "logical", operator: token.value as "&&" | "||" | "??", left, right };
        continue;
      }

      const precedence = BINARY_PRECEDENCE.get(token.value);
      if (precedence === undefined || precedence < minPrecedence) return left;
      index++;
      const right = parseBinary(precedence + 1);
      left = { kind: "binary", operator: token.value, left, right };
    }
  }

  function parseExpressionNode(): ExprNode {
    const test = parseBinary(1);
    if (!eat("?")) return test;
    const consequent = parseExpressionNode();
    expect(":");
    const alternate = parseExpressionNode();
    return { kind: "conditional", test, consequent, alternate };
  }

  const ast = parseExpressionNode();
  if (peek().type !== "eof") fail("unexpected trailing input");
  return ast;
}

/* ------------------------------------------------------------------ *
 * Method whitelist
 * ------------------------------------------------------------------ */

/**
 * Pure, non-mutating methods, allowed per receiver type. Anything that can
 * amplify its input (`repeat`, `padStart`, `padEnd`) is deliberately absent:
 * with an untrusted expression, those are a denial-of-service primitive.
 */
const STRING_METHODS = new Set([
  "includes",
  "startsWith",
  "endsWith",
  "indexOf",
  "lastIndexOf",
  "slice",
  "toLowerCase",
  "toUpperCase",
  "trim",
  "charAt",
  "at",
  "split",
]);

const ARRAY_METHODS = new Set(["includes", "indexOf", "lastIndexOf", "slice", "join", "at"]);

const NUMBER_METHODS = new Set(["toFixed", "toString"]);

/**
 * Resolve a whitelisted method, or `undefined` if the call is not allowed.
 *
 * The function is taken from the built-in prototype and compared by identity
 * with what the receiver actually exposes. That is what stops an expression
 * from reaching a function that happens to live in the *model* — a plain
 * object carrying its own `includes` is not callable through here.
 */
function resolveMethod(
  receiver: unknown,
  method: string,
): ((...args: any[]) => unknown) | undefined {
  let allowed: Set<string>;
  let prototype: object;

  if (typeof receiver === "string") {
    allowed = STRING_METHODS;
    prototype = String.prototype;
  } else if (Array.isArray(receiver)) {
    allowed = ARRAY_METHODS;
    prototype = Array.prototype;
  } else if (typeof receiver === "number") {
    allowed = NUMBER_METHODS;
    prototype = Number.prototype;
  } else {
    return undefined;
  }

  if (!allowed.has(method)) return undefined;
  const fn = (prototype as Record<string, unknown>)[method];
  if (typeof fn !== "function") return undefined;
  if ((receiver as unknown as Record<string, unknown>)[method] !== fn) return undefined;
  return fn as (...args: any[]) => unknown;
}

/* ------------------------------------------------------------------ *
 * Evaluation
 * ------------------------------------------------------------------ */

export type ExpressionScope = Record<string, unknown>;

/**
 * Property names that lead out of the data and into the prototype chain.
 * Reading `constructor` twice is the textbook way back to `Function`; calling
 * it is already refused by the whitelist, but the value should never be
 * reachable in the first place.
 */
const BLOCKED_PROPERTIES = new Set(["__proto__", "constructor", "prototype"]);

function evaluate(node: ExprNode, scope: ExpressionScope, source: string): unknown {
  switch (node.kind) {
    case "literal":
      return node.value;

    case "root":
      return scope[node.name];

    case "member": {
      const object = evaluate(node.object, scope, source);
      // Implicitly optional: a missing branch yields undefined, never a throw.
      if (object == null) return undefined;
      const property = node.computed
        ? String(evaluate(node.property, scope, source))
        : String((node.property as { value: unknown }).value);
      if (BLOCKED_PROPERTIES.has(property)) {
        throw new Error(
          `[preact-signal-formly] Expression ${JSON.stringify(source)} reads ${JSON.stringify(property)}, which is not allowed.`,
        );
      }
      return (object as Record<string, unknown>)[property];
    }

    case "call": {
      const receiver = evaluate(node.object, scope, source);
      if (receiver == null) return undefined;
      const fn = resolveMethod(receiver, node.method);
      if (!fn) {
        throw new Error(
          `[preact-signal-formly] Expression ${JSON.stringify(source)} calls ${JSON.stringify(node.method)}, which is not an allowed method on this value. Allowed: ${[...STRING_METHODS].join(", ")} (strings), ${[...ARRAY_METHODS].join(", ")} (arrays).`,
        );
      }
      const args = node.args.map((arg) => evaluate(arg, scope, source));
      return fn.apply(receiver, args);
    }

    case "unary": {
      const value = evaluate(node.argument, scope, source);
      return node.operator === "!" ? !value : -(value as number);
    }

    case "logical": {
      const left = evaluate(node.left, scope, source);
      if (node.operator === "&&") return left ? evaluate(node.right, scope, source) : left;
      if (node.operator === "||") return left ? left : evaluate(node.right, scope, source);
      return left ?? evaluate(node.right, scope, source);
    }

    case "binary": {
      const left = evaluate(node.left, scope, source) as any;
      const right = evaluate(node.right, scope, source) as any;
      switch (node.operator) {
        case "===":
          return left === right;
        case "!==":
          return left !== right;
        // biome-ignore lint/suspicious/noDoubleEquals: the language offers loose equality on purpose
        case "==":
          return left == right;
        // biome-ignore lint/suspicious/noDoubleEquals: see above
        case "!=":
          return left != right;
        case "<":
          return left < right;
        case ">":
          return left > right;
        case "<=":
          return left <= right;
        case ">=":
          return left >= right;
        case "+":
          return left + right;
        case "-":
          return left - right;
        case "*":
          return left * right;
        case "/":
          return left / right;
        case "%":
          return left % right;
        default:
          throw new Error(`[preact-signal-formly] Unknown operator ${node.operator}.`);
      }
    }

    case "conditional":
      return evaluate(node.test, scope, source)
        ? evaluate(node.consequent, scope, source)
        : evaluate(node.alternate, scope, source);
  }
}

/* ------------------------------------------------------------------ *
 * Public entry point
 * ------------------------------------------------------------------ */

/**
 * Parsed expressions are cached by source: the same config string is re-parsed
 * on neither re-render nor re-evaluation. The cache is bounded because sources
 * can come from a backend — an unbounded map would grow with every distinct
 * expression the server ever sends.
 */
const CACHE_LIMIT = 500;
const cache = new Map<string, ExprNode>();

export function parseExpression(source: string): ExprNode {
  const cached = cache.get(source);
  if (cached) return cached;
  const ast = parse(source);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(source, ast);
  return ast;
}

/** Parse (cached) and evaluate a string expression against the context. */
export function runExpression(source: string, scope: ExpressionScope): unknown {
  return evaluate(parseExpression(source), scope, source);
}
