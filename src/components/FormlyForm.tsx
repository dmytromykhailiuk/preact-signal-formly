/**
 * `createFormlyForm` — the factory `builder.build()` calls. The returned
 * component owns the base-library form, the two-way `model`/`formState` sync,
 * and renders the field tree from the `config` signal.
 */

import { FormControlContext, useForm } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { FieldValues, FormControl } from "@dmytromykhailiuk/preact-signal-hook-forms";
import type { VNode } from "preact";
import { useEffect, useMemo } from "preact/hooks";
import type { FormlyRegistry } from "../core/registry";
import { RegistryContext } from "../core/registry";
import { bindModel, bindSharedState } from "../core/sync";
import type { ValidationTiming } from "../core/timing";
import { CONTROL_TIMING_OFF, DEFAULT_TIMING, ValidationTimingContext } from "../core/timing";
import type { FormlyFormComponent, FormlyFormProps } from "../types";
import { FormlyFieldList } from "./FormlyField";

export function createFormlyForm<Model extends FieldValues = FieldValues>(
  registry: FormlyRegistry,
): FormlyFormComponent<Model> {
  return function FormlyForm(props: FormlyFormProps<Model>): VNode<any> {
    const { model, config, formState, formOptions, onSubmit, controlRef, children, className } =
      props;

    // The control is built so it never validates on its own; formly runs the
    // change/blur decision per field instead, so `validation.mode` in a field
    // config can override the form's. Everything else is passed straight
    // through (resolver, criteriaMode, delayError, …).
    const form = useForm<Model>({
      ...formOptions,
      defaultValues: model.peek(),
      ...CONTROL_TIMING_OFF,
    });
    const timing = useMemo<ValidationTiming>(
      () => ({
        mode: formOptions?.mode ?? DEFAULT_TIMING.mode,
        reValidateMode: formOptions?.reValidateMode ?? DEFAULT_TIMING.reValidateMode,
      }),
      [],
    );

    const view = useMemo(() => {
      const disposers = [bindModel(model, form), bindSharedState(formState, form.formState.shared)];
      const submitHandler = onSubmit
        ? form.handleSubmit((values, event) => onSubmit(values as Model, event))
        : (event: Event) => event.preventDefault();
      return { disposers, submitHandler };
    }, []);

    useEffect(() => {
      controlRef?.(form);
      return () => {
        for (const dispose of view.disposers) dispose();
      };
    }, []);

    return (
      <FormControlContext.Provider value={form as unknown as FormControl<FieldValues>}>
        <RegistryContext.Provider value={registry}>
          <ValidationTimingContext.Provider value={timing}>
            <form className={className} onSubmit={view.submitHandler} noValidate>
              <FormlyFieldList fields={config} parentPath="" />
              {children}
            </form>
          </ValidationTimingContext.Provider>
        </RegistryContext.Provider>
      </FormControlContext.Provider>
    );
  };
}
