// server.ts
import { serve } from "bun";

// Type definitions for process
declare var process: {
  env: {
    [key: string]: string | undefined;
  };
};

// Using bracket notation to access process.env properties to resolve TypeScript errors
const PORT = parseInt(process.env['PORT'] || "3000");
const PROXY_API_KEY = process.env['PROXY_API_KEY'];

// Cấu hình các Upstream URL - Updated to unified gateway
const UPSTREAM = {
  GATEWAY: "https://gen.pollinations.ai", // Unified gateway
  TEXT_MODELS: "https://text.pollinations.ai/models",    // Nguồn Text Models
  IMAGE_MODELS: "https://image.pollinations.ai/models",  // Nguồn Image Models (Mới)
  SIMPLE_TEXT: "https://text.pollinations.ai",
  SIMPLE_IMAGE: "https://image.pollinations.ai"
};

console.log(`🚀 Pollinations Proxy (All-in-One) running on port ${PORT}`);

// Helper: Headers giả lập trình duyệt
const getFakeHeaders = (): Record<string, string> => ({
  "Content-Type": "application/json",
  "Referer": "https://pollinations.ai/",
  "Origin": "https://pollinations.ai",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
};

serve({
  port: PORT,
  async fetch(req: Request) {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // 1. CORS Preflight
    if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    // 2. Security Middleware
    if (pathname.startsWith("/v1/") && PROXY_API_KEY) {
      const authHeader = req.headers.get("Authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token || token !== PROXY_API_KEY) {
        return Response.json({ error: { message: "Invalid API Key" } }, { status: 401, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: GET /v1/models (MERGE TEXT + IMAGE MODELS)
    // =================================================================
    if (pathname === "/v1/models" && req.method === "GET") {
      try {
        // Try unified gateway first, then fall back to separate endpoints
        const gatewayRes = await fetch(`${UPSTREAM.GATEWAY}/v1/models`, { 
          headers: getFakeHeaders() 
        });

        if (gatewayRes.ok) {
          const models = await gatewayRes.json();
          return Response.json(models, { headers: corsHeaders });
        }

        // Fallback: Fetch from separate endpoints
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
    // ROUTE: ACCOUNT MANAGEMENT
    // =================================================================
    if (pathname.startsWith("/v1/account/") && req.method === "GET") {
      try {
        // Extract the account endpoint path (e.g., /v1/account/profile -> /account/profile)
        const accountPath = pathname.replace("/v1", "");
        const accountUrl = `${UPSTREAM.GATEWAY}${accountPath}${url.search}`;
        
        // Create new headers object that includes Authorization if present
        const upstreamHeaders = getFakeHeaders();
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

        const res = await fetch(accountUrl, {
          method: req.method,
          headers: upstreamHeaders
        });

        const data = await res.json();
        return Response.json(data, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: CHAT COMPLETIONS
    // =================================================================
    if (pathname === "/v1/chat/completions" && req.method === "POST") {
      try {
        const body = await req.json();
        
        // Copy the Authorization header to send to upstream
        const upstreamHeaders = getFakeHeaders();
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

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
        if (body.top_p) payload.top_p = body.top_p;
        if (body.frequency_penalty) payload.frequency_penalty = body.frequency_penalty;
        if (body.presence_penalty) payload.presence_penalty = body.presence_penalty;

        const res = await fetch(`${UPSTREAM.GATEWAY}/v1/chat/completions`, {
          method: "POST",
          headers: upstreamHeaders,
          body: JSON.stringify(payload),
        });

        // Handle streaming response
        if (res.headers.get("Content-Type")?.includes("text/event-stream")) {
          return new Response(res.body, {
            status: res.status,
            headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "text/event-stream" }
          });
        }

        return new Response(res.body, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "application/json" }
        });
      } catch (e) {
        return Response.json({ error: String(e) }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: IMAGE GENERATIONS (OpenAI Compatible)
    // =================================================================
    if (pathname === "/v1/images/generations" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.prompt) throw new Error("Missing prompt");

        // Forward authorization if present
        const upstreamHeaders = getFakeHeaders();
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

        // OpenAI-compatible payload
        const payload = {
          prompt: body.prompt,
          model: body.model || "flux",
          n: body.n || 1,
          size: body.size || "1024x1024",
          response_format: body.response_format || "url",
          quality: body.quality || "standard",
          style: body.style || "natural",
          seed: body.seed || Math.floor(Math.random() * 1000000000),
        };

        // Extract width and height from size
        const [width, height] = (payload.size || "1024x1024").split("x").map(Number);
        
        // Construct URL with parameters
        const imageUrl = `${UPSTREAM.GATEWAY}/v1/images/generations`;
        
        const res = await fetch(imageUrl, {
          method: "POST",
          headers: { ...upstreamHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        return new Response(res.body, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "application/json" }
        });

      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: SIMPLE IMAGE GENERATION (GET method)
    // =================================================================
    if (pathname.startsWith("/v1/image/") && req.method === "GET") {
      try {
        // Extract prompt from URL (e.g., /v1/image/your-prompt-here)
        const prompt = pathname.replace("/v1/image/", "").split("?")[0];
        const width = url.searchParams.get("width") || "1024";
        const height = url.searchParams.get("height") || "1024";
        const model = url.searchParams.get("model") || "flux";
        const seed = url.searchParams.get("seed") || Math.floor(Math.random() * 1000000000);
        const nologo = url.searchParams.get("nologo") || "true";

        // Construct image URL
        const imageUrl = `${UPSTREAM.SIMPLE_IMAGE}/prompt/${encodeURIComponent(prompt)}?width=${width}&height=${height}&seed=${seed}&nologo=${nologo}&model=${model}`;

        // Fetch the image from upstream
        const imgRes = await fetch(imageUrl, { headers: getFakeHeaders() });
        
        if (!imgRes.ok) {
          return Response.json({ error: { message: "Failed to generate image" } }, { status: 500, headers: corsHeaders });
        }

        return new Response(imgRes.body, {
          status: imgRes.status,
          headers: { ...corsHeaders, "Content-Type": imgRes.headers.get("Content-Type") || "image/png" }
        });
      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: TEXT TO SPEECH
    // =================================================================
    if (pathname === "/v1/audio/speech" && req.method === "POST") {
      try {
        const body = await req.json();
        if (!body.input) throw new Error("Missing input text");

        const upstreamHeaders = getFakeHeaders();
        const authHeader = req.headers.get("Authorization");
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

        // Use the unified gateway for audio/speech
        const speechUrl = `${UPSTREAM.GATEWAY}/v1/audio/speech`;

        const res = await fetch(speechUrl, {
          method: "POST",
          headers: { ...upstreamHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            input: body.input,
            model: body.model || "openai-audio",
            voice: body.voice || "alloy",
            response_format: body.response_format || "mp3",
            speed: body.speed || 1.0
          })
        });

        return new Response(res.body, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": res.headers.get("Content-Type") || "audio/mpeg" }
        });
      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: AUDIO TRANSCRIPTIONS
    // =================================================================
    if (pathname === "/v1/audio/transcriptions" && req.method === "POST") {
      try {
        // Forward request to unified gateway
        const authHeader = req.headers.get("Authorization");
        const upstreamHeaders = getFakeHeaders();
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }
        
        // For file uploads, we need to handle the form data
        const formData = await req.formData();
        
        const res = await fetch(`${UPSTREAM.GATEWAY}/v1/audio/transcriptions`, {
          method: "POST",
          headers: upstreamHeaders, // Don't include Content-Type as it will be set by FormData
          body: formData
        });

        const data = await res.json();
        return Response.json(data, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    // =================================================================
    // ROUTE: FILES endpoints
    // =================================================================
    if (pathname.startsWith("/v1/files") && (req.method === "POST" || req.method === "GET")) {
      try {
        let res;
        const authHeader = req.headers.get("Authorization");
        const upstreamHeaders = getFakeHeaders();
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

        if (req.method === "POST") {
          const formData = await req.formData();
          res = await fetch(`${UPSTREAM.GATEWAY}${pathname}`, {
            method: "POST",
            headers: upstreamHeaders, // Don't include Content-Type as it will be set by FormData
            body: formData
          });
        } else {
          res = await fetch(`${UPSTREAM.GATEWAY}${pathname}${url.search}`, {
            method: req.method,
            headers: upstreamHeaders
          });
        }

        const data = await res.json();
        return Response.json(data, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    // For all other API routes that start with /v1/, forward them to the unified gateway
    if (pathname.startsWith("/v1/")) {
      try {
        const authHeader = req.headers.get("Authorization");
        const upstreamHeaders = getFakeHeaders();
        if (authHeader) {
          upstreamHeaders["Authorization"] = authHeader;
        }

        // For POST/PUT requests, get the body
        let body: string | FormData | null = null;
        if (req.method === "POST" || req.method === "PUT") {
          if (req.headers.get("Content-Type")?.includes("application/json")) {
            body = JSON.stringify(await req.json());
          } else {
            // For form data or other content types
            body = await req.formData();
          }
        }

        const gatewayUrl = `${UPSTREAM.GATEWAY}${pathname}${url.search}`;
        
        const res = await fetch(gatewayUrl, {
          method: req.method,
          headers: req.headers.get("Content-Type")?.includes("multipart/form-data") ? upstreamHeaders : { ...upstreamHeaders, "Content-Type": req.headers.get("Content-Type") || "application/json" },
          body: body
        });

        const data = await res.json();
        return Response.json(data, {
          status: res.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return Response.json({ error: { message: String(e) } }, { status: 500, headers: corsHeaders });
      }
    }

    return new Response("Pollinations All-in-One Proxy (v4) - Updated to match official documentation", { headers: corsHeaders });
  },
});