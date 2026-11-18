import { z } from "zod/v4";
import { QB_RECORD_DEFINITIONS } from "@/lib/quickbooks-entities";

const ENTITY_NAMES = QB_RECORD_DEFINITIONS.map((item) => item.entity) as [
  string,
  ...string[],
];

export const getCompanyInfoSchema = z.object({});

export const queryQuickBooksSchema = z.object({
  query: z
    .string()
    .min(1)
    .max(2000)
    .describe("A read-only QuickBooks SELECT query."),
  max_results: z.number().int().min(1).max(1000).optional(),
});

export const findRecordsSchema = z.object({
  entity: z.enum(ENTITY_NAMES),
  search_term: z.string().min(1).max(200),
  max_results: z.number().int().min(1).max(100).optional(),
});

export const proposeUpdateSchema = z.object({
  entity: z.enum([
    "Customer",
    "Vendor",
    "Employee",
    "Invoice",
  ]),
  record_id: z.string().min(1).max(100),
  sync_token: z.string().min(1).max(100),
  fields: z.record(z.string(), z.unknown()),
});

export const applyUpdateSchema = z.object({
  confirmation_id: z.string().min(1).max(100),
  confirmation_secret: z.string().min(1).max(200),
});

export type McpToolName =
  | "qb_get_company_info"
  | "qb_query"
  | "qb_find_records"
  | "qb_propose_update"
  | "qb_apply_update";

export const MCP_TOOL_DEFINITIONS: Record<
  McpToolName,
  { title: string; description: string; schema: z.ZodType; hidden?: boolean }
> = {
  qb_get_company_info: {
    title: "Get QuickBooks company info",
    description:
      "Return the name of the QuickBooks company connected to this browser session.",
    schema: getCompanyInfoSchema,
  },
  qb_query: {
    title: "Query QuickBooks",
    description:
      "Run a read-only SELECT query against the connected QuickBooks company. Allowed entities: Customer, Vendor, Employee, Invoice. Never writes data.",
    schema: queryQuickBooksSchema,
  },
  qb_find_records: {
    title: "Find QuickBooks records",
    description:
      "Search one QuickBooks entity by display name or document number and return matching records.",
    schema: findRecordsSchema,
  },
  qb_propose_update: {
    title: "Propose QuickBooks update",
    description:
      "Prepare an update to an existing QuickBooks record. This does not change anything until the user confirms it.",
    schema: proposeUpdateSchema,
  },
  qb_apply_update: {
    title: "Apply confirmed QuickBooks update",
    description:
      "Apply a previously proposed update after the user has confirmed it.",
    schema: applyUpdateSchema,
    hidden: true,
  },
};

export const VISIBLE_MCP_TOOLS = (
  Object.keys(MCP_TOOL_DEFINITIONS) as McpToolName[]
).filter((name) => !MCP_TOOL_DEFINITIONS[name].hidden);

const ALLOWED_ENTITIES = new Set<string>(ENTITY_NAMES);

function canonicalEntity(value: string): string | null {
  const found = ENTITY_NAMES.find((entity) => entity.toLowerCase() === value.toLowerCase());
  return found ?? null;
}

export function validateReadOnlyQuery(
  input: string,
  maxResults: number,
): { query: string; entity: string } {
  const query = input.trim().replace(/;+\s*$/, "");
  if (!/^select\s+/i.test(query)) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
  if (/[;]/.test(query)) {
    throw new Error("Multiple statements are not allowed.");
  }
  if (/\b(delete|update|insert|drop|alter|create|truncate|merge)\b/i.test(query)) {
    throw new Error("Only read-only SELECT queries are allowed.");
  }
  const match = /\bfrom\s+([a-z_]+)/i.exec(query);
  const entity = match ? canonicalEntity(match[1]) : null;
  if (!entity) {
    throw new Error(`Supported entities are: ${ENTITY_NAMES.join(", ")}.`);
  }
  return {
    query: `${query.replace(/\bfrom\s+([a-z_]+)/i, `FROM ${entity}`)} STARTPOSITION 1 MAXRESULTS ${maxResults}`,
    entity,
  };
}

export function buildFindQuery(
  entity: string,
  searchTerm: string,
  maxResults: number,
): string {
  const canonical = canonicalEntity(entity);
  if (!canonical) throw new Error(`Unsupported entity: ${entity}.`);
  const escaped = searchTerm.replace(/'/g, "''");
  const field = canonical === "Invoice" ? "DocNumber" : "DisplayName";
  return `SELECT * FROM ${canonical} WHERE ${field} LIKE '%${escaped}%' STARTPOSITION 1 MAXRESULTS ${maxResults}`;
}

export function claudeToolSchemas(): {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}[] {
  return VISIBLE_MCP_TOOLS.map((name) => {
    const definition = MCP_TOOL_DEFINITIONS[name];
    const schema = z.toJSONSchema(definition.schema) as Record<string, unknown>;
    delete schema.$schema;
    return {
      name: `mcp__quickbooks__${name}`,
      description: definition.description,
      input_schema: schema,
    };
  });
}
