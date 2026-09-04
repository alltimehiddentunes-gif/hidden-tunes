/**
 * These gates are intentionally server-only and opt-in. Undefined, empty,
 * "1", and mixed-case values all remain disabled.
 */
export function isRightsEnforcementEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RIGHTS_ENFORCEMENT_ENABLED === "true";
}

export function isRightsBulkExecutionEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RIGHTS_BULK_EXECUTION_ENABLED === "true";
}

export function isRightsAdminUiEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.RIGHTS_ADMIN_UI_ENABLED === "true";
}

export const RIGHTS_ENFORCEMENT_DEFAULT = false;
export const RIGHTS_BULK_EXECUTION_DEFAULT = false;

