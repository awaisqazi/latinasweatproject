import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
};

type UserRole = "superuser" | "admin" | "member";

const MODULE_KEYS = [
  "marketing",
  "board_projects",
  "volunteers",
  "subs",
  "events",
  "elections",
  "gala",
  "spaces",
] as const;

type Profile = {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  created_at?: string;
  updated_at?: string;
};

type AuthUser = {
  id: string;
  email?: string;
  created_at?: string;
  invited_at?: string;
  last_sign_in_at?: string;
  confirmed_at?: string;
  email_confirmed_at?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return jsonResponse({}, 204);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Supabase function environment is not configured" }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const authContext = await getSuperuserContext(req, adminClient);

  if ("error" in authContext) {
    return jsonResponse({ error: authContext.error }, authContext.status);
  }

  try {
    if (req.method === "GET") {
      return jsonResponse({ users: await listMarketingUsers(adminClient) });
    }

    if (req.method === "POST") {
      const payload = await readJson(req);

      if (payload.action === "invite") {
        return await inviteUser(req, adminClient, payload, authContext.userId);
      }

      return jsonResponse({ error: "Unsupported action" }, 400);
    }

    if (req.method === "PATCH") {
      const payload = await readJson(req);

      if (payload.action === "updateProfile") {
        return await updateUserProfile(adminClient, payload, authContext.userId);
      }

      return jsonResponse({ error: "Unsupported action" }, 400);
    }

    return jsonResponse({ error: "Method not allowed" }, 405);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "User management failed" },
      500,
    );
  }
});

async function getSuperuserContext(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
): Promise<{ userId: string } | { error: string; status: number }> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    return { error: "Missing authorization token", status: 401 };
  }

  const { data: authData, error: authError } = await adminClient.auth.getUser(token);

  if (authError || !authData.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", authData.user.id)
    .maybeSingle();

  if (profileError) {
    return { error: profileError.message, status: 500 };
  }

  if (profile?.role !== "superuser") {
    return { error: "Forbidden", status: 403 };
  }

  return { userId: authData.user.id };
}

async function listMarketingUsers(adminClient: ReturnType<typeof createClient>) {
  const [
    { data: profilesData, error: profilesError },
    { data: grantsData, error: grantsError },
    authResult,
  ] = await Promise.all([
    adminClient
      .from("profiles")
      .select("id, full_name, email, role, created_at, updated_at")
      .order("full_name", { ascending: true, nullsFirst: false }),
    adminClient.from("profile_modules").select("profile_id, module"),
    adminClient.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  if (profilesError) {
    throw new Error(profilesError.message);
  }

  if (grantsError) {
    throw new Error(grantsError.message);
  }

  if (authResult.error) {
    throw new Error(authResult.error.message);
  }

  const profiles = (profilesData || []) as Profile[];
  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));
  const modulesByProfileId = getModulesByProfileId(grantsData || []);
  const authUsers = (authResult.data.users || []) as AuthUser[];

  const users = authUsers
    .map((user) =>
      mergeAuthUserWithProfile(
        user,
        profilesById.get(user.id),
        modulesByProfileId.get(user.id) || [],
      ),
    )
    .sort((a, b) =>
      String(a.full_name || a.email).localeCompare(String(b.full_name || b.email)),
    );

  const authUserIds = new Set(authUsers.map((user) => user.id));
  const profileOnlyUsers = profiles
    .filter((profile) => !authUserIds.has(profile.id))
    .map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      role: profile.role,
      created_at: profile.created_at || null,
      updated_at: profile.updated_at || null,
      invited_at: null,
      last_sign_in_at: null,
      confirmed_at: null,
      email_confirmed_at: null,
      account_status: "profile_only",
      modules: modulesByProfileId.get(profile.id) || [],
    }));

  return [...users, ...profileOnlyUsers];
}

function getModulesByProfileId(rows: Array<{ profile_id: string; module: string }>) {
  const modulesByProfileId = new Map<string, string[]>();

  for (const row of rows) {
    if (!MODULE_KEYS.includes(row.module as (typeof MODULE_KEYS)[number])) continue;

    modulesByProfileId.set(row.profile_id, [
      ...(modulesByProfileId.get(row.profile_id) || []),
      row.module,
    ]);
  }

  return modulesByProfileId;
}

function mergeAuthUserWithProfile(
  user: AuthUser,
  profile?: Profile,
  modules: string[] = [],
) {
  const fullNameFromMetadata =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user.user_metadata?.name === "string"
        ? user.user_metadata.name
        : null;

  return {
    id: user.id,
    email: profile?.email || user.email || "",
    full_name: profile?.full_name || fullNameFromMetadata,
    role: profile?.role || metadataRole(user.app_metadata?.role),
    created_at: profile?.created_at || user.created_at || null,
    updated_at: profile?.updated_at || null,
    invited_at: user.invited_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    confirmed_at: user.confirmed_at || null,
    email_confirmed_at: user.email_confirmed_at || null,
    account_status: getAccountStatus(user),
    modules,
  };
}

function metadataRole(value: unknown): UserRole {
  if (value === "superuser") return "superuser";
  if (value === "admin") return "admin";
  return "member";
}

function getAccountStatus(user: AuthUser): "active" | "invited" | "pending" {
  if (user.email_confirmed_at || user.confirmed_at || user.last_sign_in_at) {
    return "active";
  }

  if (user.invited_at) {
    return "invited";
  }

  return "pending";
}

async function inviteUser(
  req: Request,
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  currentUserId: string,
) {
  const email = normalizeEmail(payload.email);
  const fullName = normalizeString(payload.full_name);
  const role = normalizeRole(payload.role);
  const modules = normalizeModules(payload.modules);

  if (!email) {
    return jsonResponse({ error: "Email is required" }, 400);
  }

  const origin = req.headers.get("origin") || "https://latinasweatproject.com";
  const redirectTo = `${origin}/admin/marketing/reset-password`;

  const { data: inviteData, error: inviteError } =
    await adminClient.auth.admin.inviteUserByEmail(email, {
      data: {
        full_name: fullName || email.split("@")[0],
      },
      redirectTo,
    });

  if (inviteError) {
    return jsonResponse({ error: inviteError.message }, 400);
  }

  const user = inviteData.user;

  if (!user) {
    return jsonResponse({ error: "Invite did not return a user" }, 500);
  }

  const profile = await upsertProfile(adminClient, {
    id: user.id,
    email,
    full_name: fullName || user.user_metadata?.full_name || email.split("@")[0],
    role,
  });

  await updateAuthRole(adminClient, user.id, role, user.app_metadata);

  const grantsResult = await replaceModuleGrants(
    adminClient,
    user.id,
    role === "superuser" ? [] : modules,
    currentUserId,
  );

  if ("error" in grantsResult) {
    return jsonResponse(
      { error: `Invite sent, but module access could not be saved: ${grantsResult.error}` },
      500,
    );
  }

  return jsonResponse({
    ok: true,
    user: mergeAuthUserWithProfile(
      {
        id: user.id,
        email: user.email,
        created_at: user.created_at,
        invited_at: user.invited_at,
        last_sign_in_at: user.last_sign_in_at,
        confirmed_at: user.confirmed_at,
        email_confirmed_at: user.email_confirmed_at,
        user_metadata: user.user_metadata,
        app_metadata: { ...(user.app_metadata || {}), role },
      },
      profile,
      role === "superuser" ? [] : modules,
    ),
  });
}

async function updateUserProfile(
  adminClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  currentUserId: string,
) {
  const userId = normalizeString(payload.userId);
  const role = normalizeRole(payload.role);
  const fullName = normalizeString(payload.full_name);

  if (!userId) {
    return jsonResponse({ error: "User ID is required" }, 400);
  }

  if (currentUserId === userId && role !== "superuser") {
    return jsonResponse({ error: "You cannot remove your own superuser access." }, 400);
  }

  if (role !== "superuser" && (await isLastSuperuser(adminClient, userId))) {
    return jsonResponse({ error: "At least one superuser account is required." }, 400);
  }

  const { data: existingProfile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name, email, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    return jsonResponse({ error: profileError.message }, 500);
  }

  if (!existingProfile) {
    return jsonResponse({ error: "Profile not found" }, 404);
  }

  const { data: updatedProfile, error: updateError } = await adminClient
    .from("profiles")
    .update({
      full_name: fullName || existingProfile.full_name,
      role,
    })
    .eq("id", userId)
    .select("id, full_name, email, role, created_at, updated_at")
    .single();

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  const { data: userData, error: userError } = await adminClient.auth.admin.getUserById(
    userId,
  );

  if (userError) {
    return jsonResponse({ error: userError.message }, 500);
  }

  const user = userData.user as AuthUser;

  await updateAuthProfile(
    adminClient,
    userId,
    role,
    user.app_metadata,
    user.user_metadata,
    updatedProfile.full_name,
  );

  const modules = role === "superuser" ? [] : normalizeModules(payload.modules);
  const grantsResult = await replaceModuleGrants(
    adminClient,
    userId,
    modules,
    currentUserId,
  );

  if ("error" in grantsResult) {
    return jsonResponse({ error: grantsResult.error }, 500);
  }

  return jsonResponse({
    ok: true,
    user: mergeAuthUserWithProfile(
      {
        ...user,
        app_metadata: { ...(user.app_metadata || {}), role },
      },
      updatedProfile as Profile,
      modules,
    ),
  });
}

async function upsertProfile(
  adminClient: ReturnType<typeof createClient>,
  profile: Pick<Profile, "id" | "email" | "full_name" | "role">,
): Promise<Profile> {
  const { data, error } = await adminClient
    .from("profiles")
    .upsert(profile, { onConflict: "id" })
    .select("id, full_name, email, role, created_at, updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Profile;
}

async function updateAuthRole(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  role: UserRole,
  appMetadata: Record<string, unknown> | undefined,
) {
  const { error } = await adminClient.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...(appMetadata || {}),
      role,
    },
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function updateAuthProfile(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  role: UserRole,
  appMetadata: Record<string, unknown> | undefined,
  userMetadata: Record<string, unknown> | undefined,
  fullName: string | null,
) {
  const updatePayload: {
    app_metadata: Record<string, unknown>;
    user_metadata?: Record<string, unknown>;
  } = {
    app_metadata: {
      ...(appMetadata || {}),
      role,
    },
  };

  if (fullName) {
    updatePayload.user_metadata = {
      ...(userMetadata || {}),
      full_name: fullName,
      name: fullName,
    };
  }

  const { error } = await adminClient.auth.admin.updateUserById(
    userId,
    updatePayload,
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function replaceModuleGrants(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  modules: string[],
  grantedBy: string,
): Promise<{ ok: true } | { error: string }> {
  const { error: deleteError } = await adminClient
    .from("profile_modules")
    .delete()
    .eq("profile_id", userId);

  if (deleteError) {
    return { error: deleteError.message };
  }

  if (!modules.length) {
    return { ok: true };
  }

  const { error: insertError } = await adminClient.from("profile_modules").insert(
    modules.map((module) => ({
      profile_id: userId,
      module,
      granted_by: grantedBy,
    })),
  );

  if (insertError) {
    return { error: insertError.message };
  }

  return { ok: true };
}

async function isLastSuperuser(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
): Promise<boolean> {
  const { count, error } = await adminClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "superuser");

  if (error) {
    throw new Error(error.message);
  }

  if ((count || 0) > 1) {
    return false;
  }

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  if (profileError) {
    throw new Error(profileError.message);
  }

  return profile?.role === "superuser";
}

async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    throw new Error("Invalid JSON payload");
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeString(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeEmail(value: unknown): string {
  return normalizeString(value).toLowerCase();
}

function normalizeRole(value: unknown): UserRole {
  if (value === "superuser") return "superuser";
  if (value === "admin") return "admin";
  return "member";
}

function normalizeModules(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const allowed = new Set<string>(MODULE_KEYS);

  return Array.from(
    new Set(
      value
        .map((item) => normalizeString(item))
        .filter((item) => allowed.has(item)),
    ),
  );
}
