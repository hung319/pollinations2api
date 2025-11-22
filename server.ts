// server.ts
import { serve } from "bun";

const PORT = process.env.PORT || 3000;
const PROXY_API_KEY = process.env.PROXY_API_KEY;

// Cấu hình các Upstream URL
const UPSTREAM = {
  CHAT: "https://text.pollinations.ai/openai",
  TEXT_MODELS: "https://text.pollinations.ai/models",    // Nguồn Text Models
  IMAGE_MODELS: "https://image.pollinations.ai/models",  // Nguồn Image Models (Mới)
  IMAGE_GEN: "https://image.pollinations.ai/prompt",
  TEXT_BASE: "https://text.pollinations.ai"
};

console.log(`🚀 Pollinations Proxy (All-in-One) running on port ${PORT}`);

// Helper: Headers giả lập trình duyệt
const getFakeHeaders = () => ({
  "Content-Type": "application/json",
  "Referer": "https://pollinations.ai/",
  "Origin": "https://pollinations.ai",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    // 1. CORS Preflight
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 2. Security Middleware
    if (url.pathname.startsWith("/v1/") && PROXY_API_KEY) {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token || token !== PROXY_API_KEY) {
        return Response.json({ error: { message: "Invalid API Key" } }, { status: 401, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: GET /v1/models (MERGE TEXT + IMAGE MODELS)
    // =================================================================
    if (url.pathname === "/v1/models" && req.method === "GET") {
      try {
        // Gọi song song 2 API để tiết kiệm thời gian
        const [textRes, imageRes] = await Promise.all([
            fetch(UPSTREAM.TEXT_MODELS, { headers: getFakeHeaders() }),
            fetch(UPSTREAM.IMAGE_MODELS, { headers: getFakeHeaders() })
        ]);

        let allModels: any[] = [];

        // 1. Xử lý Text Models
        if (textRes.ok) {
            const textModels = await textRes.json();
            if (Array.isArray(textModels)) {
                const mappedText = textModels.map((m: any) => ({
                    id: m.name,
                    object: "model",
                    created: Date.now(),
                    owned_by: "pollinations-text", // Đánh dấu là text
                    permission: [],
                    root: m.name,
                    description: m.description
                }));
                allModels = allModels.concat(mappedText);
            }
        }

        // 2. Xử lý Image Models (["flux", "turbo", ...])
        if (imageRes.ok) {
            const imageModels = await imageRes.json();
            if (Array.isArray(imageModels)) {
                const mappedImage = imageModels.map((name: string) => ({
                    id: name,
                    object: "model",
                    created: Date.now(),
                    owned_by: "pollinations-image", // Đánh dấu là image
                    permission: [],
                    root: name,
                    description: "Image Generation Model"
                }));
                allModels = allModels.concat(mappedImage);
            }
        }

        return Response.json({ object: "list", data: allModels }, { headers: corsHeaders });

      } catch (error) {
        return Response.json({ error: "Failed to fetch models list" }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: CHAT COMPLETIONS
    // =================================================================
    if (url.pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        const body = await req.json();
        
        // Payload chuẩn
        const payload: any = {
          model: body.model || "openai",
          messages: body.messages,
          max_tokens: body.max_tokens || 2048,
          stream: body.stream || false,
        };
        
        if (body.temperature !== undefined) payload.temperature = body.temperature;
        if (body.reasoning_effort) payload.reasoning_effort = body.reasoning_effort;
        if (body.seed) payload.seed = body.seed;

        const res = await fetch(UPSTREAM.CHAT, {
          method: "POST",
          headers: getFakeHeaders(),
          body: JSON.stringify(payload),
        });

        return new Response(res.body, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "application/json" }
        });
      } catch (e) { return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders }); }
    }

    // =================================================================
    // ROUTE: IMAGE GENERATIONS
    // =================================================================
    if (url.pathname === "/v1/images/generations" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.prompt) throw new Error("Missing prompt");

        const size = body.size || "1024x1024";
        const [w, h] = size.split("x");
        
        // Dùng model từ body gửi lên (flux, turbo...), mặc định là flux
        const model = body.model || "flux"; 
        const seed = Math.floor(Math.random() * 1000000000);
        
        // URL tạo ảnh
        const imageUrl = `${UPSTREAM.IMAGE_GEN}/${encodeURIComponent(body.prompt)}?width=${w||1024}&height=${h||1024}&seed=${seed}&nologo=true&model=${model}`;

        return Response.json({
          created: Math.floor(Date.now() / 1000),
          data: [{ url: imageUrl }]
        }, { headers: corsHeaders });

      } catch (e) { return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders }); }
    }

    // =================================================================
    // ROUTE: TEXT TO SPEECH
    // =================================================================
    if (url.pathname === "/v1/audio/speech" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.input) throw new Error("Missing input text");
        
        const ttsUrl = `${UPSTREAM.TEXT_BASE}/${encodeURIComponent(body.input)}?model=openai-audio&voice=${body.voice || "alloy"}`;
        const audioRes = await fetch(ttsUrl, { headers: getFakeHeaders() });

        return new Response(audioRes.body, {
          headers: { ...corsHeaders, "Content-Type": "audio/mpeg" }
        });
      } catch (e) { return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders }); }
    }

    return new Response("Pollinations All-in-One Proxy (v3)", { headers: corsHeaders });
  },
});
