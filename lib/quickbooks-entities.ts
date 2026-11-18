export type QuickBooksRecordDefinition = {
  entity: string;
  key: string;
  label: string;
  file: string;
  canUpdate: boolean;
};

export const QB_RECORD_DEFINITIONS: QuickBooksRecordDefinition[] = [
  { entity: "Customer", key: "customers", label: "Customers", file: "quickbooks-customers.csv", canUpdate: true },
  { entity: "Vendor", key: "vendors", label: "Vendors", file: "quickbooks-vendors.csv", canUpdate: true },
  { entity: "Employee", key: "employees", label: "Employees", file: "quickbooks-employees.csv", canUpdate: true },
  { entity: "Invoice", key: "invoices", label: "Invoices", file: "quickbooks-invoices.csv", canUpdate: true },
];

export const QB_UPDATABLE_ENTITIES = new Set(
  QB_RECORD_DEFINITIONS.filter((definition) => definition.canUpdate).map(
    (definition) => definition.entity,
  ),
);

const QB_ENTITY_ALIASES = new Map<string, string>();
for (const definition of QB_RECORD_DEFINITIONS) {
  QB_ENTITY_ALIASES.set(definition.entity.toLowerCase(), definition.entity);
  QB_ENTITY_ALIASES.set(definition.key.toLowerCase(), definition.entity);
}

export const QUICKBOOKS_UPDATES_FILE = "quickbooks-updates.json";
export const QUICKBOOKS_MAX_OPERATIONS = 25;

const PROTECTED_UPDATE_FIELDS = new Set([
  "Id",
  "SyncToken",
  "sparse",
  "domain",
  "MetaData",
  "status",
  "CreatedTime",
  "LastUpdatedTime",
]);

export type QuickBooksUpdateOperation = {
  entity: string;
  id: string;
  syncToken: string;
  fields: Record<string, unknown>;
};

const asText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

/** Validate an AI-proposed quickbooks-updates.json payload. */
export function parseQuickBooksUpdates(input: unknown): {
  operations?: QuickBooksUpdateOperation[];
  error?: string;
} {
  const raw = Array.isArray(input)
    ? input
    : input &&
        typeof input === "object" &&
        Array.isArray((input as { operations?: unknown }).operations)
      ? (input as { operations: unknown[] }).operations
      : null;

  if (!raw) {
    return { error: "Provide an operations array." };
  }
  if (raw.length < 1 || raw.length > QUICKBOOKS_MAX_OPERATIONS) {
    return {
      error: `Provide between 1 and ${QUICKBOOKS_MAX_OPERATIONS} update operations.`,
    };
  }

  const operations: QuickBooksUpdateOperation[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const item = raw[index];
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return { error: `Operation ${index + 1} must be an object.` };
    }
    const operation = item as Record<string, unknown>;
    const requestedEntity = asText(operation.entity);
    const entity =
      QB_ENTITY_ALIASES.get(requestedEntity.toLowerCase()) ?? "";
    const id = asText(operation.id ?? operation.Id);
    const syncToken = asText(operation.syncToken ?? operation.SyncToken);
    const fieldsInput = operation.fields ?? operation.data;

    if (!entity || !QB_UPDATABLE_ENTITIES.has(entity)) {
      return {
        error: `Operation ${index + 1} has an unsupported entity: ${requestedEntity || "(missing)"}.`,
      };
    }
    if (!id) {
      return { error: `Operation ${index + 1} is missing a QuickBooks Id.` };
    }
    if (!syncToken) {
      return {
        error: `Operation ${index + 1} is missing a SyncToken. Re-import fresh QuickBooks data and run the task again.`,
      };
    }
    if (
      !fieldsInput ||
      typeof fieldsInput !== "object" ||
      Array.isArray(fieldsInput)
    ) {
      return {
        error: `Operation ${index + 1} must include a fields object.`,
      };
    }

    const fields = Object.fromEntries(
      Object.entries(fieldsInput as Record<string, unknown>).filter(
        ([key]) => !PROTECTED_UPDATE_FIELDS.has(key),
      ),
    );

    if (!Object.keys(fields).length) {
      return {
        error: `Operation ${index + 1} does not contain any updateable fields.`,
      };
    }

    operations.push({ entity, id, syncToken, fields });
  }

  return { operations };
}
