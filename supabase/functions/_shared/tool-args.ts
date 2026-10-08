/**
 * Checking a tool call against the schema the model was handed.
 *
 * Thirty-five tools declare parameter schemas for the model. Nothing read them
 * back. Arguments arrived as `any` and were coerced by hand at each call site —
 * `(args.lead_ids ?? []).slice(0, 10).map((x: any) => String(x))` — so a tool
 * call that did not match its own schema became strange behaviour somewhere
 * downstream rather than a rejection the model could act on. A missing
 * `lead_ids` read as an empty list and the tool reported doing nothing to
 * nobody; a `limit` of "all" read as NaN; unparseable JSON became `{}`, and
 * `list_leads` with no filters is every lead the account has.
 *
 * The schemas use a small slice of JSON Schema and this validates exactly that
 * slice: object/string/number/boolean/array, with properties, required, items,
 * enum and default. Nothing declares minimum, maximum, format or
 * additionalProperties, so nothing here implements them. When a schema starts
 * using one, add it here and the tests below will be where it is specified.
 *
 * It coerces before it rejects. Models routinely send "25" for a number and
 * "true" for a boolean, and the hand-written code accepted both for years, so
 * refusing them now would break working flows to prove a point. What it will
 * not do is invent a value: a required argument that is absent is an error,
 * and a string where an object belongs is an error.
 */

export interface ToolSchema {
  type?: string;
  properties?: Record<string, ToolSchema>;
  required?: string[];
  items?: ToolSchema;
  enum?: unknown[];
  default?: unknown;
  description?: string;
}

export type ArgCheck =
  | { ok: true; args: Record<string, unknown> }
  | { ok: false; errors: string[] };

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** One value against one schema. `path` names the parameter in any error. */
function coerceValue(
  value: unknown,
  schema: ToolSchema,
  path: string,
  errors: string[],
): unknown {
  const type = schema.type;

  if (type === "array") {
    /*
     * A bare value where a list belongs is wrapped, not rejected.
     *
     * `lead_ids: "abc"` is the single commonest shape error in a tool call and
     * the intent is never ambiguous. Refusing it costs the user a turn to
     * arrive at the same place.
     */
    const list = Array.isArray(value) ? value : [value];
    const itemSchema = schema.items;
    return itemSchema
      ? list.map((entry, i) => coerceValue(entry, itemSchema, `${path}[${i}]`, errors))
      : list;
  }

  if (type === "object") {
    if (!isPlainObject(value)) {
      errors.push(`${path} must be an object`);
      return value;
    }
    return schema.properties ? coerceObject(value, schema, path, errors) : value;
  }

  if (type === "number" || type === "integer") {
    if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        errors.push(`${path} must be a number`);
        return value;
      }
      return type === "integer" ? Math.trunc(value) : value;
    }
    if (typeof value === "string" && value.trim() !== "") {
      const n = Number(value);
      if (Number.isFinite(n)) return type === "integer" ? Math.trunc(n) : n;
    }
    errors.push(`${path} must be a number, got ${describe(value)}`);
    return value;
  }

  if (type === "boolean") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const t = value.trim().toLowerCase();
      if (t === "true") return true;
      if (t === "false") return false;
    }
    errors.push(`${path} must be true or false, got ${describe(value)}`);
    return value;
  }

  if (type === "string") {
    if (typeof value === "string") return value;
    // A number or boolean read back as text is what the call site did anyway.
    if (typeof value === "number" || typeof value === "boolean") return String(value);
    errors.push(`${path} must be a string, got ${describe(value)}`);
    return value;
  }

  // No declared type: the schema is not asking for anything, so nothing to check.
  return value;
}

/** What the caller actually sent, said briefly enough for a tool result. */
function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  if (isPlainObject(value)) return "an object";
  return `${typeof value} ${JSON.stringify(value)}`.slice(0, 60);
}

function coerceObject(
  raw: Record<string, unknown>,
  schema: ToolSchema,
  prefix: string,
  errors: string[],
): Record<string, unknown> {
  const props = schema.properties ?? {};
  // Unknown keys ride along untouched: no schema here sets
  // additionalProperties, so dropping them would discard data the tool may
  // read deliberately.
  const out: Record<string, unknown> = { ...raw };

  for (const [key, propSchema] of Object.entries(props)) {
    const path = prefix ? `${prefix}.${key}` : key;
    /*
     * An empty string is an absent value, not a value.
     *
     * Otherwise `lead_ids: ""` wraps into `[""]` and the tool goes looking for
     * a lead whose id is the empty string, and `query: ""` becomes a filter
     * that matches on nothing. The required check below already reads "" as
     * missing; this makes the two agree.
     */
    const raw_value = raw[key];
    const present = key in raw && raw_value !== null && raw_value !== undefined && raw_value !== "";

    if (!present) {
      if (propSchema.default !== undefined) out[key] = propSchema.default;
      else delete out[key];
      continue;
    }

    const coerced = coerceValue(raw[key], propSchema, path, errors);
    out[key] = coerced;

    if (propSchema.enum && !propSchema.enum.includes(coerced as never)) {
      errors.push(
        `${path} must be one of ${propSchema.enum.map((v) => JSON.stringify(v)).join(", ")}, got ${
          JSON.stringify(coerced)
        }`,
      );
    }
  }

  for (const key of schema.required ?? []) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (out[key] === undefined || out[key] === null || out[key] === "") {
      errors.push(`${path} is required`);
    }
  }

  return out;
}

/**
 * Validate and coerce one tool call's arguments.
 *
 * Returns the usable arguments, or every problem at once — one round trip
 * beats the model fixing a parameter at a time.
 */
export function validateToolArgs(
  schema: ToolSchema | undefined,
  raw: unknown,
): ArgCheck {
  if (!schema || !schema.properties) {
    // A tool that declares no parameters takes whatever it is given.
    return { ok: true, args: isPlainObject(raw) ? raw : {} };
  }
  if (!isPlainObject(raw)) {
    return { ok: false, errors: ["arguments must be a JSON object"] };
  }

  const errors: string[] = [];
  const args = coerceObject(raw, schema, "", errors);
  return errors.length ? { ok: false, errors } : { ok: true, args };
}

/**
 * The rejection, phrased for the model that has to fix it.
 *
 * Shaped like the scope gate's refusal, which the model already handles: an
 * `error` code it can branch on and a `note` telling it what to do. Naming the
 * tool and every bad parameter is what makes the retry different from the call
 * that just failed.
 */
export function invalidArgsResult(toolName: string, errors: string[]) {
  return {
    error: "invalid_arguments",
    tool: toolName,
    problems: errors,
    note:
      `The call to ${toolName} did not match its parameter schema: ${errors.join("; ")}. ` +
      "Fix the arguments and call it once more. Do not reach for a different tool, and do not " +
      "tell the user the action is done — nothing ran.",
  };
}
