// @ts-nocheck
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

// Strips characters that LOOK invisible/normal on screen but break
// strict email parsers: non-breaking spaces, zero-width spaces,
// smart-quote-adjacent junk, and any other non-printable unicode.
function sanitizeEmail(raw: string) {
  return raw
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF\u00A0\u2060]/g, "") // zero-width + NBSP chars
    .trim()
    .toLowerCase();
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return response({ error: "Only POST requests are supported." }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    // Accept either secret name — SUPABASE_SERVICE_ROLE_KEY is the
    // standard convention; SERVICE_ROLE_KEY kept for backward compat.
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
      Deno.env.get("SERVICE_ROLE_KEY");
    const authorization = request.headers.get("Authorization");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      console.error("Missing env vars", {
        hasUrl: !!supabaseUrl,
        hasAnon: !!anonKey,
        hasServiceRole: !!serviceRoleKey,
      });
      return response(
        {
          error:
            "Function is not configured. Check SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY.",
        },
        500,
      );
    }

    if (!authorization) {
      return response({ error: "Missing Authorization header." }, 401);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
    });

    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();

    if (callerError || !caller) {
      return response({ error: "Not authenticated." }, 401);
    }

    const { data: profile, error: profileError } = await callerClient
      .from("profiles")
      .select("role")
      .eq("id", caller.id)
      .maybeSingle();

    if (profileError) {
      return response(
        { error: `Could not verify admin profile: ${profileError.message}` },
        500,
      );
    }

    if (profile?.role !== "admin") {
      return response(
        { error: "Only an admin can invite interviewers." },
        403,
      );
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return response({ error: "Request body must be valid JSON." }, 400);
    }

    const rawEmail = typeof body?.email === "string" ? body.email : "";
    const email = sanitizeEmail(rawEmail);
    const name = typeof body?.name === "string" ? body.name.trim() : "";
    const department =
      typeof body?.department === "string" && body.department.trim()
        ? body.department.trim()
        : null;

    // Debug log — check Supabase Dashboard → Edge Functions →
    // invite-interviewer → Logs to see exactly what arrived,
    // including hidden character codes.
    console.log("Invite request received", {
      rawEmail,
      rawEmailCharCodes: Array.from(rawEmail).map((c) => c.charCodeAt(0)),
      sanitizedEmail: email,
      name,
    });

    if (!email || !name) {
      return response({ error: "Name and email are required." }, 400);
    }

    if (!isValidEmail(email)) {
      return response(
        {
          error: `Invalid email address: ${email}`,
          debugCharCodes: Array.from(email).map((c) => c.charCodeAt(0)),
        },
        400,
      );
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: invite, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, {
        redirectTo: "interviewpulse://",
        redirectTo: "interviewpulse://",
        data: {
          name,
          role: "interviewer",
        },
      });

    if (inviteError) {
      console.error("inviteUserByEmail failed:", inviteError);
      const message = inviteError.message || "Could not send invitation.";
      const lowerMessage = message.toLowerCase();

      if (
        lowerMessage.includes("already") ||
        lowerMessage.includes("registered")
      ) {
        return response(
          { error: "This email already has a Supabase account." },
          409,
        );
      }

      if (lowerMessage.includes("rate limit")) {
        return response(
          { error: "Email rate limit exceeded. Configure SMTP or try later." },
          429,
        );
      }

      const status =
        typeof (inviteError as any).status === "number"
          ? (inviteError as any).status
          : 400;
      return response({ error: message }, status);
    }

    const invitedUserId = invite?.user?.id;
    if (!invitedUserId) {
      return response(
        { error: "Supabase did not return the invited user's ID." },
        502,
      );
    }

    const { error: upsertError } = await adminClient.from("profiles").upsert(
      {
        id: invitedUserId,
        name,
        email,
        role: "interviewer",
        department,
      },
      { onConflict: "id" },
    );

    if (upsertError) {
      return response(
        {
          error:
            `Invitation was sent, but profile creation failed: ${upsertError.message}`,
        },
        502,
      );
    }

    return response({
      success: true,
      message: `Invitation sent to ${email}.`,
      userId: invitedUserId,
    });
  } catch (error) {
    console.error("Unhandled error:", error);
    return response(
      {
        error: error instanceof Error ? error.message : "Unexpected error.",
      },
      500,
    );
  }
});