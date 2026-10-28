/**
 * Profiles for a set of user ids, in batches small enough to be a URL.
 *
 * `subscriptions` cannot embed `profiles`: both reference `auth.users(id)` and
 * neither references the other, so PostgREST has no relationship to resolve
 * and answers 400. The way round it is a second query keyed on `profiles.id`
 * — but `.in("id", ids)` becomes `?id=in.(…)` in the query string, and a UUID
 * costs 37 characters there. `audit-free-tier-emails` reads up to 2000
 * subscriptions, which is a 74 KB URL; its default of 500 is still 18 KB.
 * Gateways reject both, so the obvious fix trades a query that always failed
 * for one that fails on ordinary input.
 *
 * 200 ids per request is ~7.4 KB, comfortably inside any limit, and the whole
 * default page costs three round trips.
 */

export const PROFILE_ID_BATCH = 200;

export interface ProfileRow {
  id: string;
  email: string;
  full_name: string | null;
}

interface ProfileClient {
  from(table: string): {
    select(columns: string): {
      in(column: string, values: string[]): PromiseLike<
        { data: ProfileRow[] | null; error: { message: string } | null }
      >;
    };
  };
}

/**
 * Returns a map of id to profile. Ids are de-duplicated and blanks dropped.
 *
 * Throws on a failed batch rather than returning what it managed to read: a
 * partial map reads as "those users have no profile", and the callers use a
 * missing profile to mean "skip this account".
 */
export async function profilesById(
  client: ProfileClient,
  userIds: readonly string[],
): Promise<Map<string, ProfileRow>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const byId = new Map<string, ProfileRow>();
  for (let i = 0; i < ids.length; i += PROFILE_ID_BATCH) {
    const batch = ids.slice(i, i + PROFILE_ID_BATCH);
    const { data, error } = await client
      .from("profiles")
      .select("id, email, full_name")
      .in("id", batch);
    if (error) {
      throw new Error(
        `profiles lookup failed for ${batch.length} id(s) at offset ${i}: ${error.message}`,
      );
    }
    for (const row of data ?? []) byId.set(row.id, row);
  }
  return byId;
}
