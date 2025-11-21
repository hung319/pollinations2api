// server.ts
const PORT = process.env.PORT || 3000;
const PROXY_API_KEY = process.env.PROXY_API_KEY; // Đọc key từ .env

const UPSTREAM_CHAT = "https://text.pollinations.ai/openai";
const UPSTREAM_MODELS = "https://text.pollinations.ai/models";

console.log(`🚀 Pollinations Proxy Secured running on port ${PORT}`);
if (PROXY_API_KEY) {
  console.log(`🔒 Security Enabled: API Key required.`);
} else {
  console.log(`⚠️ Warning: No PROXY_API_KEY set. Server is open to public!`);
}

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // ==================================================================
    // 🛡️ SECURITY CHECK (MIDDLEWARE)
    // ==================================================================
    // Chỉ bảo vệ các route bắt đầu bằng /v1/
    if (url.pathname.startsWith("/v1/") && PROXY_API_KEY) {
      const authHeader = req.headers.get("Authorization");
      
      // Lấy token từ header: "Bearer sk-..." -> "sk-..."
      const token = authHeader?.startsWith("Bearer ") 
        ? authHeader.slice(7) 
        : authHeader;

      // So sánh token gửi lên với key trong .env
      if (!token || token !== PROXY_API_KEY) {
        return Response.json(
          { 
            error: { 
              message: "Invalid API Key. You are not authorized.", 
              type: "invalid_request_error",
              code: "invalid_api_key"
            } 
          },
          { status: 401, headers: corsHeaders }
        );
      }
    }
    // ==================================================================

    // --- ROUTE: MODELS ---
    if (url.pathname === "/v1/models" && req.method === "GET") {
      try {
        const response = await fetch(UPSTREAM_MODELS);
        const rawModels = await response.json();
        const openAIModels = {
          object: "list",
          data: Array.isArray(rawModels)
            ? rawModels.map((m: any) => ({
                id: m.name,
                object: "model",
                created: Date.now(),
                owned_by: "pollinations-ai",
                permission: [],
                root: m.name,
                parent: null,
              }))
            : [],
        };
        return Response.json(openAIModels, { headers: corsHeaders });
      } catch (error) {
        return Response.json({ error: "Fetch models failed" }, { status: 500, headers: corsHeaders });
      }
    }

    // --- ROUTE: CHAT COMPLETIONS ---
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        const body = await req.json();

        const payload: any = {
          model: body.model || "openai",
          messages: body.messages,
          max_tokens: body.max_tokens || 2048,
          stream: body.stream || false,
        };

        if (body.temperature !== undefined) payload.temperature = body.temperature;
        if (body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;

        // Lưu ý: Ta KHÔNG forward header Authorization của client sang Pollinations
        // Vì đó là key của Proxy mình, Pollinations không hiểu key đó.
        // Ta dùng Referer spoofing để xác thực với Pollinations.
        
        const upstreamResponse = await fetch(UPSTREAM_CHAT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Referer": "https://pollinations.ai/", // Auth với Pollinations bằng Referer
            "Origin": "https://pollinations.ai",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          body: JSON.stringify(payload),
        });

        if (!upstreamResponse.ok) {
            const errorText = await upstreamResponse.text();
            try {
                const jsonError = JSON.parse(errorText);
                return Response.json(jsonError, { status: upstreamResponse.status, headers: corsHeaders });
            } catch {
                return Response.json(
                    { error: { message: errorText, type: "upstream_error" } }, 
                    { status: upstreamResponse.status, headers: corsHeaders }
                );
            }
        }

        return new Response(upstreamResponse.body, {
          status: upstreamResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": upstreamResponse.headers.get("Content-Type") || "application/json",
          },
        });

      } catch (error) {
        return Response.json({ error: String(error) }, { status: 500, headers: corsHeaders });
      }
    }

    // Health check (Không cần API Key để các tool monitoring kiểm tra được server sống hay chết)
    if (url.pathname === "/") {
      return new Response(JSON.stringify({ status: "ok", secured: !!PROXY_API_KEY }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});
