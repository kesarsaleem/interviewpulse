const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Only POST requests are supported." }, 405);
  }

  const apiKey = Deno.env.get("ANAM_API_KEY");
  const personaId = Deno.env.get("ANAM_PERSONA_ID");

  if (!apiKey || !personaId) {
    console.error("Missing ANAM_API_KEY or ANAM_PERSONA_ID secret.");
    return jsonResponse(
      { error: "Anam session token function is not configured." },
      500,
    );
  }

  try {
    const anamResponse = await fetch(
      "https://api.anam.ai/v1/auth/session-token",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          personaConfig: {
            personaId,
          },
        }),
      },
    );

    if (!anamResponse.ok) {
      const details = await anamResponse.text();
      console.error("Anam session-token request failed:", {
        status: anamResponse.status,
        details,
      });
      return jsonResponse(
        { error: `Anam rejected the session-token request (${anamResponse.status}).` },
        502,
      );
    }

    const data: unknown = await anamResponse.json();
    const sessionToken =
      typeof data === "object" &&
      data !== null &&
      "sessionToken" in data &&
      typeof data.sessionToken === "string"
        ? data.sessionToken
        : null;

    if (!sessionToken) {
      console.error("Anam returned no sessionToken.");
      return jsonResponse(
        { error: "Anam returned an invalid session-token response." },
        502,
      );
    }

    return jsonResponse({ sessionToken });
  } catch (error) {
    console.error("Unhandled Anam session-token error:", error);
    return jsonResponse(
      { error: "Could not create an Anam session token." },
      500,
    );
  }
});
