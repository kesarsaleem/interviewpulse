import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

interface InviteRequestBody {
  email?: string;
  name?: string;
  department?: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const authHeader = req.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse({ error: "Function is not configured" }, 500);
    }
    if (!authHeader) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return jsonResponse({ error: "Not authenticated" }, 401);
    }

    const { data: callerProfile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .single();

    if (profileError || callerProfile?.role !== "admin") {
      return jsonResponse(
        { error: "Only an admin can invite interviewers" },
        403,
      );
    }

    let body: InviteRequestBody;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Request body must be valid JSON" }, 400);
    }

    const email = body.email?.trim().toLowerCase();
    const name = body.name?.trim();
    const department = body.department?.trim() || null;

    if (!email || !name) {
      return jsonResponse({ error: "Email and name are required" }, 400);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return jsonResponse({ error: "A valid email is required" }, 400);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { name, role: "interviewer" },
      });

    if (inviteError) {
      if (inviteError.message.toLowerCase().includes("already")) {
        return jsonResponse(
          { error: "This email already has an account." },
          409,
        );
      }
      return jsonResponse({ error: inviteError.message }, 400);
    }

    const newUserId = inviteData.user?.id;
    if (!newUserId) {
      return jsonResponse({ error: "Invitation did not create a user" }, 502);
    }

    const { error: upsertError } = await adminClient.from("profiles").upsert({
      id: newUserId,
      name,
      email,
      role: "interviewer",
      department,
    });

    if (upsertError) {
      return jsonResponse(
        { error: `Invitation sent, but profile creation failed: ${upsertError.message}` },
        502,
      );
    }

    return jsonResponse({
      success: true,
      message: `Invitation sent to ${email}`,
      userId: newUserId,
    });
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : "Unexpected error" },
      500,
    );
  }
});
