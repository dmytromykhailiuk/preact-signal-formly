import { effect, signal } from "@preact/signals";
import { afterEach, describe, expect, it } from "vitest";
import { bindSharedState } from "../src/core/sync";
import type { FormlySharedState } from "../src/types";

let cleanup: Array<() => void> = [];
afterEach(() => {
  for (const fn of cleanup) fn();
  cleanup = [];
});

describe("bindSharedState", () => {
  it("prop writes flow to shared and back, same reference on both sides", () => {
    const prop = signal<FormlySharedState>(undefined);
    const shared = signal<FormlySharedState>(undefined);
    cleanup.push(bindSharedState(prop, shared));

    const state = { step: 1 };
    prop.value = state;
    expect(shared.value).toBe(state);

    const next = { step: 2 };
    shared.value = next;
    expect(prop.value).toBe(next);
  });

  it("a defined prop wins initially", () => {
    const initial = { theme: "dark" };
    const prop = signal<FormlySharedState>(initial);
    const shared = signal<FormlySharedState>(undefined);
    cleanup.push(bindSharedState(prop, shared));
    expect(shared.value).toBe(initial);
  });

  it("a defined shared value seeds an undefined prop", () => {
    const existing = { fromForm: true };
    const prop = signal<FormlySharedState>(undefined);
    const shared = signal<FormlySharedState>(existing);
    cleanup.push(bindSharedState(prop, shared));
    expect(prop.value).toBe(existing);
  });

  it("echo writes stop on the reference guard (no loops)", () => {
    const prop = signal<FormlySharedState>(undefined);
    const shared = signal<FormlySharedState>(undefined);
    cleanup.push(bindSharedState(prop, shared));

    let propRuns = 0;
    let sharedRuns = 0;
    cleanup.push(
      effect(() => {
        prop.value;
        propRuns++;
      }),
    );
    cleanup.push(
      effect(() => {
        shared.value;
        sharedRuns++;
      }),
    );
    propRuns = 0;
    sharedRuns = 0;

    prop.value = { a: 1 };
    expect(propRuns).toBe(1);
    expect(sharedRuns).toBe(1);
  });
});
