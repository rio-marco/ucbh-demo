export const AGENT_PERMISSIONS = ["read", "create", "update", "delete"] as const;

export type AgentPermission = (typeof AGENT_PERMISSIONS)[number];

export function isAgentPermission(value: unknown): value is AgentPermission {
  return (
    typeof value === "string" &&
    (AGENT_PERMISSIONS as readonly string[]).includes(value)
  );
}

export function normalizeAgentPermissions(value: unknown): AgentPermission[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.filter(isAgentPermission)),
  ) as AgentPermission[];
}

export function hasAgentPermission(
  scopes: readonly AgentPermission[] | null | undefined,
  permission: AgentPermission,
): boolean {
  return Boolean(scopes?.includes(permission));
}
