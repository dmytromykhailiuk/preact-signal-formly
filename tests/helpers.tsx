import type { FieldValues } from "@dmytromykhailiuk/preact-signal-hook-forms";
import { signal } from "@preact/signals";
import type { Signal } from "@preact/signals";
import { render } from "@testing-library/preact";
import type { FormlyFieldConfig, FormlyFormComponent, FormlySharedState } from "../src/types";

export interface RenderedForm<Model extends FieldValues> {
  model: Signal<Model>;
  config: Signal<FormlyFieldConfig[]>;
  formState: Signal<FormlySharedState>;
  container: HTMLElement;
  unmount: () => void;
  rerender: ReturnType<typeof render>["rerender"];
  getByTestId: (id: string) => HTMLElement;
}

export function renderForm<Model extends FieldValues>(
  Form: FormlyFormComponent<Model>,
  config: FormlyFieldConfig[],
  initialModel: Model = {} as Model,
  extraProps: Record<string, any> = {},
): RenderedForm<Model> {
  const model = signal<Model>(initialModel);
  const configSignal = signal<FormlyFieldConfig[]>(config);
  const formState = signal<FormlySharedState>(undefined);
  const result = render(
    <Form model={model} config={configSignal} formState={formState} {...extraProps} />,
  );
  return {
    model,
    config: configSignal,
    formState,
    container: result.container as HTMLElement,
    unmount: result.unmount,
    rerender: result.rerender,
    getByTestId: (id: string) => {
      const el = result.container.querySelector(`[data-testid="${id}"]`);
      if (!el) throw new Error(`No element with data-testid="${id}"`);
      return el as HTMLElement;
    },
  };
}

/** Input helper: fire an input event with a value. */
export function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

export function blur(element: HTMLElement): void {
  element.dispatchEvent(new Event("blur", { bubbles: true }));
}

export { signal };
