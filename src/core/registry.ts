/**
 * The registry holds everything registered on a builder. `build()` takes an
 * immutable snapshot, so registrations made after `build()` never affect
 * already-built components.
 */

import { createContext } from "preact";
import type {
  ArrayTypeComponent,
  FieldTypeComponent,
  FormlyExtension,
  FormlyValidationMessage,
  FormlyValidatorFn,
  TypeRegistrationOptions,
  WrapperComponent,
} from "../types";

export interface TypeRegistration {
  component: FieldTypeComponent<any, any>;
  options: TypeRegistrationOptions<any>;
}

export interface ValidatorRegistration {
  fn: FormlyValidatorFn;
  message?: FormlyValidationMessage;
}

export interface FormlyRegistry {
  readonly types: ReadonlyMap<string, TypeRegistration>;
  readonly arrayTypes: ReadonlyMap<string, ArrayTypeComponent<any>>;
  readonly wrappers: ReadonlyMap<string, WrapperComponent>;
  readonly validators: ReadonlyMap<string, ValidatorRegistration>;
  readonly messages: ReadonlyMap<string, FormlyValidationMessage>;
  readonly extensions: ReadonlyMap<string, FormlyExtension>;
}

/** Mutable registry the builder writes into. */
export interface MutableFormlyRegistry {
  types: Map<string, TypeRegistration>;
  arrayTypes: Map<string, ArrayTypeComponent<any>>;
  wrappers: Map<string, WrapperComponent>;
  validators: Map<string, ValidatorRegistration>;
  messages: Map<string, FormlyValidationMessage>;
  extensions: Map<string, FormlyExtension>;
}

export function createMutableRegistry(): MutableFormlyRegistry {
  return {
    types: new Map(),
    arrayTypes: new Map(),
    wrappers: new Map(),
    validators: new Map(),
    messages: new Map(),
    extensions: new Map(),
  };
}

export function snapshotRegistry(registry: MutableFormlyRegistry): FormlyRegistry {
  return Object.freeze({
    types: new Map(registry.types),
    arrayTypes: new Map(registry.arrayTypes),
    wrappers: new Map(registry.wrappers),
    validators: new Map(registry.validators),
    messages: new Map(registry.messages),
    extensions: new Map(registry.extensions),
  });
}

export const RegistryContext = createContext<FormlyRegistry | null>(null);

function known(map: ReadonlyMap<string, unknown>): string {
  return map.size ? [...map.keys()].join(", ") : "(none)";
}

export function resolveType(registry: FormlyRegistry, name: string): TypeRegistration {
  const registration = registry.types.get(name);
  if (!registration) {
    throw new Error(
      `[preact-signal-formly] Unknown field type "${name}". Registered types: ${known(registry.types)}.`,
    );
  }
  return registration;
}

export function resolveWrapper(registry: FormlyRegistry, name: string): WrapperComponent {
  const wrapper = registry.wrappers.get(name);
  if (!wrapper) {
    throw new Error(
      `[preact-signal-formly] Unknown wrapper "${name}". Registered wrappers: ${known(registry.wrappers)}.`,
    );
  }
  return wrapper;
}

export function resolveValidator(registry: FormlyRegistry, name: string): ValidatorRegistration {
  const validator = registry.validators.get(name);
  if (!validator) {
    throw new Error(
      `[preact-signal-formly] Unknown validator "${name}". Registered validators: ${known(registry.validators)}.`,
    );
  }
  return validator;
}
