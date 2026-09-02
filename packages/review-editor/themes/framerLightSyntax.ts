import { registerCustomTheme } from "@pierre/diffs";
import {
  FRAMER_LIGHT_SYNTAX_THEME_NAME,
  framerLightSyntaxTheme,
} from "@plannotator/ui/themes/framerLightSyntax";

// Re-export for Pierre consumers to keep existing import path.
export { FRAMER_LIGHT_SYNTAX_THEME_NAME } from "@plannotator/ui/themes/framerLightSyntax";

registerCustomTheme(FRAMER_LIGHT_SYNTAX_THEME_NAME, async () => framerLightSyntaxTheme);
