/**
 * A code-split field type: the playground registers it with
 * `registerLazyType("color", () => import("./lazy-color"))`, so this module is
 * a separate chunk that is only fetched when a `color` field renders.
 *
 * Nothing here is special — a lazily loaded type is written exactly like an
 * eager one, and once it mounts it never re-renders (watch the console).
 */

import { useController } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { useComputed } from "@preact/signals";
import { For } from "@preact/signals/utils";
import { createFieldType } from "../index";

const SWATCHES = ["#ef4444", "#f59e0b", "#10b981", "#2563eb", "#8b5cf6"];

interface Swatch {
  color: string;
  active: boolean;
}

export default createFieldType(({ control, namePath }) => {
  console.log("LazyColorType render");
  const { field } = useController<Record<string, any>>({ control, name: namePath });
  const swatches = useComputed<Swatch[]>(() =>
    SWATCHES.map((color) => ({ color, active: field.value.value === color })),
  );
  return (
    <div class="rating">
      <For each={swatches} getKey={(swatch: Swatch) => swatch.color}>
        {(swatch: Swatch) => (
          <span
            class={swatch.active ? "star active" : "star"}
            style={`color: ${swatch.color}`}
            onClick={() => field.onChange(swatch.color)}
          >
            ●
          </span>
        )}
      </For>
    </div>
  );
}, "LazyColorType");
