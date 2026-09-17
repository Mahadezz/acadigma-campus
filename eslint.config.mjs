/**
 * One flat config for the whole monorepo. Rules that need type information are
 * scoped to source files only, so config files and generated code stay cheap to lint.
 */
import { acadigmaEslintConfig } from "@acadigma/config/eslint"

export default acadigmaEslintConfig
