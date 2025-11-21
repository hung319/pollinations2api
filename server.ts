// server.ts
const PORT = process.env.PORT || 3000;
const UPSTREAM_CHAT = "https://text.pollinations.ai/openai";
const UPSTREAM_MODELS = "https://text.pollinations.ai/models";

console.log(`🚀 Pollinations Proxy (Auto-Fix Temp) running on port ${PORT}`);

Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // CORS Headers
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
    };

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

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

        // Logic xử lý Payload thông minh hơn
        const payload: any = {
          model: body.model || "openai", 
          messages: body.messages,
          max_tokens: body.max_tokens || 2048, // Tăng mặc định token lên
          stream: body.stream || false,
        };

        // FIX QUAN TRỌNG: Chỉ gửi temperature nếu client gửi lên.
        // Không tự ý default là 0.7 nữa để tránh lỗi Azure 400.
        if (body.temperature !== undefined) {
            payload.temperature = body.temperature;
        }

        // Hỗ trợ thêm các tham số khác nếu có
        if (body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;
        if (body.seed) payload.seed = body.seed;

        // Giả mạo Headers để vượt qua check anonymous
        const upstreamResponse = await fetch(UPSTREAM_CHAT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Referer": "https://pollinations.ai/", 
            "Origin": "https://pollinations.ai",
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
          },
          body: JSON.stringify(payload),
        });

        // Log lỗi nếu upstream trả về lỗi (để debug)
        if (!upstreamResponse.ok) {
            const errorText = await upstreamResponse.text();
            console.error("⚠️ Upstream Error:", upstreamResponse.status, errorText);
            
            // Trả về JSON lỗi chuẩn OpenAI thay vì text thô
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

    return new Response("Not Found", { status: 404, headers: corsHeaders });
  },
});
