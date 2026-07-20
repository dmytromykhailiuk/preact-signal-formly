import type { FormlyValidationMessage } from "../types";

/** Default messages for the built-in rules mapped from `props`. */
export const defaultValidationMessages: Record<string, FormlyValidationMessage> = {
  required: "This field is required",
  min: (_error, field) => `Value must be at least ${field.props?.min}`,
  max: (_error, field) => `Value must be at most ${field.props?.max}`,
  minLength: (_error, field) => `Must be at least ${field.props?.minLength} characters`,
  maxLength: (_error, field) => `Must be at most ${field.props?.maxLength} characters`,
  pattern: "Invalid format",
};
