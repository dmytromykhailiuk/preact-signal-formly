/**
 * The string expression language. These strings arrive with the config — from
 * a backend, in the JSON case — so the tests below are as much about what the
 * language *cannot* do as about what it can.
 */

import { signal } from "@preact/signals";
import { describe, expect, it } from "vitest";
import { runExpression } from "../src/core/expression-lang";

const scope = (model: unknown, extra: Record<string, unknown> = {}) => ({
  model: signal(model),
  formState: signal({ step: 2, tags: ["a", "b"] }),
  field: signal({ props: { label: "Name" } }),
  namePath: "user.city",
  ...extra,
});

const run = (source: string, model: unknown = {}) => runExpression(source, scope(model));

describe("reading values", () => {
  it("walks the model through the signal", () => {
    expect(run("model.value.address.country", { address: { country: "ua" } })).toBe("ua");
  });

  it("returns undefined for a missing branch instead of throwing", () => {
    expect(run("model.value.address.country", {})).toBeUndefined();
    expect(run("model.value.a.b.c.d.e", {})).toBeUndefined();
  });

  it("accepts optional chaining as a no-op, since access is always safe", () => {
    expect(run("model.value?.address?.country", {})).toBeUndefined();
    expect(run("model.value?.address?.country", { address: { country: "pl" } })).toBe("pl");
  });

  it("indexes arrays, with expressions as the index", () => {
    const model = { items: [{ id: 10 }, { id: 20 }] };
    expect(run("model.value.items[1].id", model)).toBe(20);
    expect(run("model.value.items[model.value.pick].id", { ...model, pick: 0 })).toBe(10);
  });

  it("reads the other roots", () => {
    expect(run("formState.value.step")).toBe(2);
    expect(run("field.value.props.label")).toBe("Name");
    expect(run("namePath")).toBe("user.city");
  });

  it("reads .length as a plain property", () => {
    expect(run("model.value.items.length", { items: [1, 2, 3] })).toBe(3);
  });
});

describe("operators", () => {
  it("negates and compares", () => {
    expect(run("!model.value.country", {})).toBe(true);
    expect(run("!model.value.country", { country: "ua" })).toBe(false);
    expect(run("model.value.age >= 18", { age: 18 })).toBe(true);
    expect(run("model.value.age < 18", { age: 21 })).toBe(false);
    expect(run("model.value.role === 'admin'", { role: "admin" })).toBe(true);
    expect(run("model.value.role !== 'admin'", { role: "user" })).toBe(true);
  });

  it("combines with &&, || and ??", () => {
    const model = { a: true, b: false, missing: null, fallback: "x" };
    expect(run("model.value.a && model.value.b", model)).toBe(false);
    expect(run("model.value.a || model.value.b", model)).toBe(true);
    expect(run("model.value.missing ?? model.value.fallback", model)).toBe("x");
  });

  it("short-circuits", () => {
    // The right side would throw if it were evaluated on a non-whitelisted call.
    expect(run("false && model.value.x.notAMethod()", {})).toBe(false);
    expect(run("true || model.value.x.notAMethod()", {})).toBe(true);
  });

  it("does arithmetic and honours precedence", () => {
    expect(run("1 + 2 * 3")).toBe(7);
    expect(run("(1 + 2) * 3")).toBe(9);
    expect(run("model.value.n % 2 === 0", { n: 4 })).toBe(true);
  });

  it("supports the ternary", () => {
    expect(run("model.value.n > 0 ? 'pos' : 'neg'", { n: 1 })).toBe("pos");
    expect(run("model.value.n > 0 ? 'pos' : 'neg'", { n: -1 })).toBe("neg");
  });

  it("knows the keyword literals", () => {
    expect(run("true")).toBe(true);
    expect(run("null")).toBe(null);
    expect(run("undefined")).toBeUndefined();
  });
});

describe("whitelisted methods", () => {
  it("calls pure string methods", () => {
    const model = { email: "User@Example.com" };
    expect(run("model.value.email.toLowerCase()", model)).toBe("user@example.com");
    expect(run("model.value.email.includes('@')", model)).toBe(true);
    expect(run("model.value.email.startsWith('User')", model)).toBe(true);
    expect(run("model.value.email.split('@')[1]", model)).toBe("Example.com");
  });

  it("calls pure array methods", () => {
    const model = { tags: ["a", "b", "c"] };
    expect(run("model.value.tags.includes('b')", model)).toBe(true);
    expect(run("model.value.tags.join('-')", model)).toBe("a-b-c");
    expect(run("model.value.tags.indexOf('c')", model)).toBe(2);
  });

  it("returns undefined when the receiver is missing", () => {
    expect(run("model.value.tags.includes('b')", {})).toBeUndefined();
  });
});

describe("the security boundary", () => {
  it("rejects any root other than the context", () => {
    for (const source of [
      "window",
      "globalThis.fetch",
      "document.cookie",
      "process.env",
      "constructor",
      "eval('1')",
    ]) {
      expect(() => run(source)).toThrow(/unknown identifier|only method calls/i);
    }
  });

  it("cannot reach a constructor to rebuild Function", () => {
    // The classic escape: (0).constructor.constructor("return process")().
    // Rejected while parsing — the result of a call can never be called.
    expect(() => run("model.value.x.constructor.constructor('return 1')()", { x: {} })).toThrow(
      /only method calls are allowed/,
    );
    // And the read itself is refused, well before anything could be called.
    expect(() => run("model.value.x.constructor", { x: {} })).toThrow(
      /reads "constructor", which is not allowed/,
    );
    expect(() => run("model.value.x.__proto__", { x: {} })).toThrow(/not allowed/);
    // Also through a computed key, where the name is not visible in the source.
    expect(() => run("model.value.x['con' + 'structor']", { x: {} })).toThrow(/not allowed/);
  });

  it("does not treat prototype members as keyword literals", () => {
    // `"constructor" in { true: … }` is true via Object.prototype — a lookup
    // table keyed by untrusted text must not walk the prototype chain.
    expect(() => run("constructor")).toThrow(/unknown identifier "constructor"/);
    expect(() => run("toString")).toThrow(/unknown identifier "toString"/);
    expect(() => run("hasOwnProperty")).toThrow(/unknown identifier/);
  });

  it("refuses a non-whitelisted method even on a legitimate receiver", () => {
    expect(() => run("model.value.tags.map('x')", { tags: [] })).toThrow(/not an allowed method/);
    expect(() => run("model.value.tags.push(1)", { tags: [] })).toThrow(/not an allowed method/);
    expect(() => run("model.value.s.repeat(1000000)", { s: "a" })).toThrow(/not an allowed method/);
  });

  it("refuses a function that merely *looks* whitelisted but lives in the model", () => {
    let escaped = false;
    const model = {
      evil: {
        includes: () => {
          escaped = true;
          return true;
        },
      },
    };
    expect(() => run("model.value.evil.includes('x')", model)).toThrow(/not an allowed method/);
    expect(escaped).toBe(false);
  });

  it("refuses to call a value directly", () => {
    expect(() => run("model.value.fn()", { fn: () => 1 })).toThrow(/not an allowed method/);
    expect(() => run("model('x')", {})).toThrow(/only method calls are allowed/);
  });

  it("has no assignment", () => {
    expect(() => run("model.value.x = 1", { x: 0 })).toThrow(/Invalid expression/);
  });
});

describe("syntax errors", () => {
  it("throws with the offending source", () => {
    expect(() => run("model.value.a &&")).toThrow(/Invalid expression "model\.value\.a &&"/);
    expect(() => run("model.value.(a)")).toThrow(/expected a property name/);
    expect(() => run("(model.value.a")).toThrow(/expected "\)"/);
    expect(() => run("model.value.a ? 1")).toThrow(/expected ":"/);
    expect(() => run("'unterminated")).toThrow(/unterminated string/);
    expect(() => run("model.value.a #")).toThrow(/unexpected character/);
    expect(() => run("model.value.a b")).toThrow(/unexpected trailing input/);
  });
});
