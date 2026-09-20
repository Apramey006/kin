import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServiceClient } from "@/lib/supabase";

export class AccessError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function getAuthClient() {
  const jar = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => jar.getAll(),
        setAll: (values) => {
          try {
            values.forEach(({ name, value, options }) =>
              jar.set(name, value, options),
            );
          } catch {
            /* Middleware refreshes Server Component cookies. */
          }
        },
      },
    },
  );
}
export async function requireUser() {
  const auth = await getAuthClient();
  const {
    data: { user },
    error,
  } = await auth.auth.getUser();
  if (error || !user) throw new AccessError("Please sign in to continue.", 401);
  return { user, auth };
}
export async function requireFamily(options: { contributor?: boolean } = {}) {
  const { user, auth } = await requireUser();
  const sb = getServiceClient();
  const membership = await sb
    .from("family_members")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (membership.error)
    throw new AccessError(
      "Family accounts are being set up. Please try again shortly.",
      503,
    );
  if (!membership.data)
    throw new AccessError("Finish setting up your family first.", 409);
  const role =
    membership.data.role === "loved_one" ? "loved_one" : "contributor";
  if (options.contributor && role !== "contributor")
    throw new AccessError("Only family contributors can change memories.", 403);
  const family = await sb
    .from("families")
    .select("owner_id")
    .eq("id", membership.data.family_id)
    .single();
  if (family.error) throw family.error;
  return {
    sb,
    auth,
    user,
    familyId: membership.data.family_id as string,
    relativeId: membership.data.relative_id as string | null,
    role,
    isOwner: family.data.owner_id === user.id,
  };
}
export function requireContributor(actual: string | null, requested: unknown) {
  if (!actual || actual !== requested)
    throw new AccessError("You can only change your own contributions.", 403);
}
