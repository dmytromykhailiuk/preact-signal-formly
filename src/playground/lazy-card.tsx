/**
 * A code-split wrapper, registered with
 * `registerLazyWrapper("card", () => import("./lazy-card"))`. A wrapper owns
 * its children, so the field it wraps appears only once this chunk lands.
 */

import { useComputed } from "@preact/signals";
import { Show } from "@preact/signals/utils";
import { createWrapper } from "../index";

export default createWrapper(({ props, errorMessage, children, id }) => {
  console.log("LazyCardWrapper render");
  const label = useComputed(() => props.value.label);
  return (
    <div
      class="playground-wrapper"
      style="border: 1px dashed #8b5cf6; border-radius: 8px; padding: 0.6rem;"
    >
      <Show when={label}>
        <label for={id}>{label}</label>
      </Show>
      {children}
      <Show when={errorMessage}>
        {(message) => <span class="formly-error">{message}</span>}
      </Show>
    </div>
  );
}, "LazyCardWrapper");
