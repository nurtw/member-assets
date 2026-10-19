/**
 * Reading the API's own OpenAPI documents for the docs page (item 54).
 *
 * The page writes no list of routes by hand. The routes come from the API:
 * the integration reference for anyone, and the whole map only for a holder
 * of `docs.read_internal`, after the API has checked. These functions turn
 * either document into what the page shows. Pure, so they are tested.
 */

/** The permission that opens the whole map (`@nurtw/contracts`). */
export const READ_INTERNAL_DOCS = "docs.read_internal";

/** What the API's `SIGNED_IN` marker reads as, in a route's description. */
const SIGNED_IN_MARKER = "(any signed-in officer)";

export type Access =
  | { kind: "scope"; name: string }
  | { kind: "permission"; name: string }
  | { kind: "signed-in" }
  | { kind: "public" }
  | { kind: "portal" };

export interface DocField {
  name: string;
  type: string;
  required: boolean;
  description: string | null;
}

export interface DocOperation {
  /** Unique on the page, and safe as an element id. */
  id: string;
  method: string;
  path: string;
  /** The first part of the path after the version: what it is about. */
  area: string;
  summary: string;
  /** The route's own words, without the line that names its access. */
  description: string;
  access: Access;
  parameters: DocField[];
  body: DocField[];
  responses: { status: string; description: string }[];
}

interface OpenApiSchema {
  type?: string | string[];
  enum?: unknown[];
  const?: unknown;
  format?: string;
  items?: OpenApiSchema;
  anyOf?: OpenApiSchema[];
  oneOf?: OpenApiSchema[];
  properties?: Record<string, OpenApiSchema>;
  required?: string[];
  description?: string;
}

interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: {
    name: string;
    in: string;
    required?: boolean;
    description?: string;
    schema?: OpenApiSchema;
  }[];
  requestBody?: { content?: Record<string, { schema?: OpenApiSchema }> };
  responses?: Record<string, { description?: string }>;
  security?: Record<string, string[]>[];
}

export interface OpenApiDocument {
  info?: { title?: string; version?: string; description?: string };
  servers?: { url: string }[];
  paths?: Record<string, Record<string, OpenApiOperation>>;
}

const METHOD_ORDER = ["get", "post", "put", "patch", "delete"];
const ACCESS_LINE =
  /\*\*(Scope required|Permission required|Portal account required|Authentication)[^\n]*/g;

/** Who may call a route, from its security and, for a session's route, its description. */
export function accessOf(operation: OpenApiOperation): Access {
  const security = operation.security;
  if (security) {
    if (security.length === 0) {
      return { kind: "public" };
    }
    const [first] = security;
    if (first?.apiToken) {
      return { kind: "scope", name: first.apiToken[0] ?? "" };
    }
    if (first?.portalCookie) {
      return { kind: "portal" };
    }
  }
  const named = /\*\*Permission required:\*\* `([^`]+)`/.exec(
    operation.description ?? "",
  );
  if (!named || named[1] === SIGNED_IN_MARKER) {
    return { kind: "signed-in" };
  }
  return { kind: "permission", name: named[1]! };
}

/** A schema's type, in a word or two: `string`, `integer`, `one of A, B`, `array of string`. */
export function typeOf(schema: OpenApiSchema | undefined): string {
  if (!schema) {
    return "any";
  }
  if (schema.enum && schema.enum.length > 0) {
    return `one of ${schema.enum.map(String).join(", ")}`;
  }
  if (schema.const !== undefined) {
    return String(schema.const);
  }
  const options = schema.anyOf ?? schema.oneOf;
  if (options && options.length > 0) {
    return [...new Set(options.map(typeOf))].join(" or ");
  }
  const type = Array.isArray(schema.type)
    ? schema.type.filter((entry) => entry !== "null").join(" or ")
    : schema.type;
  if (type === "array") {
    return `array of ${typeOf(schema.items)}`;
  }
  if (type === "string" && schema.format && schema.format !== "date-time") {
    return `string (${schema.format})`;
  }
  return type ?? "any";
}

/** The fields at the top of a request body, required ones first. */
export function fieldsOf(schema: OpenApiSchema | undefined): DocField[] {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  return Object.entries(properties)
    .map(([name, property]) => ({
      name,
      type: typeOf(property),
      required: required.has(name),
      description: property.description ?? null,
    }))
    .sort((a, b) => Number(b.required) - Number(a.required));
}

/** A body to start from: each field, with a value of its type. */
export function exampleBody(fields: DocField[]): Record<string, unknown> {
  return Object.fromEntries(
    fields
      .filter((field) => field.required)
      .map((field) => [field.name, exampleValue(field.type)]),
  );
}

function exampleValue(type: string): unknown {
  if (type.startsWith("one of ")) {
    return type.slice("one of ".length).split(", ")[0];
  }
  if (type.startsWith("integer") || type.startsWith("number")) {
    return 0;
  }
  if (type.startsWith("boolean")) {
    return true;
  }
  if (type.startsWith("array")) {
    return [];
  }
  return "…";
}

/** What a route is about: the first part of its path after `/api/v1`. */
export function areaOf(path: string): string {
  const parts = path.replace(/^\/api\/v\d+\//, "").split("/");
  return parts[0] ?? "";
}

/** Every operation in a document, by area, then path, then method. */
export function operationsOf(document: OpenApiDocument): DocOperation[] {
  const operations: DocOperation[] = [];
  for (const [path, methods] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(methods)) {
      const parameters = (operation.parameters ?? []).map((parameter) => ({
        name: parameter.name,
        type: `${parameter.in} · ${typeOf(parameter.schema)}`,
        required: parameter.required ?? false,
        description: parameter.description ?? null,
      }));
      const schema =
        operation.requestBody?.content?.["application/json"]?.schema;
      operations.push({
        id: `${method}-${path}`
          .replace(/[^a-zA-Z0-9]+/g, "-")
          .replace(/-+$/, ""),
        method: method.toUpperCase(),
        path,
        area: areaOf(path),
        summary: operation.summary ?? "",
        description: (operation.description ?? "")
          .replace(ACCESS_LINE, "")
          .trim(),
        access: accessOf(operation),
        parameters,
        body: fieldsOf(schema),
        responses: Object.entries(operation.responses ?? {}).map(
          ([status, response]) => ({
            status,
            description: response.description ?? "",
          }),
        ),
      });
    }
  }
  return operations.sort(
    (a, b) =>
      a.area.localeCompare(b.area) ||
      a.path.localeCompare(b.path) ||
      METHOD_ORDER.indexOf(a.method.toLowerCase()) -
        METHOD_ORDER.indexOf(b.method.toLowerCase()),
  );
}

/** How a route's access reads on the page. */
export function accessLabel(access: Access): string {
  switch (access.kind) {
    case "scope":
      return `Scope ${access.name}`;
    case "permission":
      return access.name;
    case "signed-in":
      return "Any signed-in officer";
    case "public":
      return "Public";
    case "portal":
      return "Portal account";
  }
}

/** Whether a route answers a search: its method, path, summary, or access. */
export function matchesSearch(
  operation: DocOperation,
  search: string,
): boolean {
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) {
    return true;
  }
  const text = [
    operation.method,
    operation.path,
    operation.summary,
    accessLabel(operation.access),
  ]
    .join(" ")
    .toLowerCase();
  return words.every((word) => text.includes(word));
}

/** Operations by area, in order, for a list with a heading per area. */
export function byArea(
  operations: DocOperation[],
): { area: string; operations: DocOperation[] }[] {
  const groups = new Map<string, DocOperation[]>();
  for (const operation of operations) {
    const group = groups.get(operation.area) ?? [];
    group.push(operation);
    groups.set(operation.area, group);
  }
  return [...groups.entries()].map(([area, entries]) => ({
    area,
    operations: entries,
  }));
}
