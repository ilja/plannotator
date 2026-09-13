import { createContext, useContext } from "react";
import type { CodePathValidation } from "../hooks/useValidatedCodePaths";

export type CodePathValidationContextValue = CodePathValidation;

export const CodePathValidationContext = createContext<CodePathValidationContextValue | null>(null);

export function useCodePathValidation(): CodePathValidationContextValue | null {
  return useContext(CodePathValidationContext);
}
