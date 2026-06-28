/* ════════════════════════════════════════════════════════════
   ATLAS AI PROXY WORKER
   Single endpoint that all client pages call — no API key is ever
   sent to or stored in the browser. Keys live ONLY as Worker secrets
   (set via `wrangler secret put` or the Cloudflare dashboard — see
   the deployment notes at the bottom of this file).

   Endpoint: POST /  (or any path — this worker has one route)
   Body:     { question: string, image?: { base64, mimeType }, systemPrompt?: string }
   Response: { success: true, answer: string, provider: string }
             { success: false, error: string }

   Fallback order (each step only runs if the previous one failed
   or returned an unusably short/empty answer):
     1. Google Gemini 2.5 Flash       (vision-capable)
     2. OpenRouter — Qwen2.5-VL-72B   (vision-capable, free tier)
     3. Groq — Llama 3.3 70B          (text) / Llama 3.2 90B Vision (image)
     4. Cerebras — Llama 3.3 70B      (text only, fastest inference)
     5. Cloudflare Workers AI         (text + vision, last resort —
                                        runs on the same account as this
                                        worker, no separate key needed)
   ════════════════════════════════════════════════════════════ */

const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default {
    async fetch(request, env, ctx) {
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: CORS_HEADERS });
        }
        if (request.method !== "POST") {
            return jsonResponse({ success: false, error: "Only POST allowed" }, 405);
        }

        let body;
        try {
            body = await request.json();
        } catch (e) {
            return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
        }

        const question = (body.question || "").trim();
        const image = body.image || null; // { base64, mimeType }
        const systemPrompt = body.systemPrompt || "তুমি একজন সহায়ক AI।";

        if (!question && !image) {
            return jsonResponse({ success: false, error: "question বা image এর একটি দিতে হবে" }, 400);
        }

        const providers = [
            () => callGemini(env, question, systemPrompt, image),
            () => callOpenRouter(env, question, systemPrompt, image),
            () => callGroq(env, question, systemPrompt, image),
            () => callCerebras(env, question, systemPrompt, image),
            () => callCloudflareAI(env, question, systemPrompt, image),
        ];

        const errors = [];
        for (const tryProvider of providers) {
            try {
                const result = await tryProvider();
                if (result && result.answer && result.answer.trim().length > 5) {
                    return jsonResponse({ success: true, answer: result.answer, provider: result.provider });
                }
                if (result?.error) errors.push(result.error);
            } catch (e) {
                errors.push(String(e.message || e));
            }
        }

        return jsonResponse({
            success: false,
            error: "সব AI provider ব্যর্থ হয়েছে। আবার চেষ্টা করো।",
            details: errors,
        }, 502);
    },
};

function jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
        status,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
}

/* ───────── 1. Google Gemini ───────── */
async function callGemini(env, question, systemPrompt, image) {
    const key = env.GEMINI_API_KEY;
    if (!key) return { error: "GEMINI_API_KEY not set" };

    const parts = [];
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
    parts.push({ text: systemPrompt + "\n\nপ্রশ্ন: " + (question || "এই ছবিটি বিশ্লেষণ করো।") });

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens: 2048 } }),
        }
    );
    if (!res.ok) return { error: `Gemini HTTP ${res.status}` };
    const data = await res.json();
    const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    const finishReason = data.candidates?.[0]?.finishReason;
    if (finishReason === "MAX_TOKENS") return { error: "Gemini: response truncated, increase maxOutputTokens" };
    return answer ? { answer, provider: "gemini" } : { error: "Gemini: empty response" };
}

/* ───────── 2. OpenRouter (free vision model) ───────── */
async function callOpenRouter(env, question, systemPrompt, image) {
    const key = env.OPENROUTER_API_KEY;
    if (!key) return { error: "OPENROUTER_API_KEY not set" };

    let userContent;
    if (image) {
        userContent = [
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
            { type: "text", text: question || "এই ছবিটি বিশ্লেষণ করো এবং বাংলায় ব্যাখ্যা দাও।" },
        ];
    } else {
        userContent = question;
    }

    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: "qwen/qwen2.5-vl-72b-instruct:free",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
            ],
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });
    if (!res.ok) return { error: `OpenRouter HTTP ${res.status}` };
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || null;
    return answer ? { answer, provider: "openrouter" } : { error: "OpenRouter: empty response" };
}

/* ───────── 3. Groq ───────── */
async function callGroq(env, question, systemPrompt, image) {
    const key = env.GROQ_API_KEY;
    if (!key) return { error: "GROQ_API_KEY not set" };

    const model = image ? "llama-3.2-90b-vision-preview" : "llama-3.3-70b-versatile";
    let messages;
    if (image) {
        messages = [
            { role: "system", content: systemPrompt },
            {
                role: "user",
                content: [
                    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
                    { type: "text", text: question || "এই ছবিটি বিশ্লেষণ করো এবং বাংলায় ব্যাখ্যা দাও।" },
                ],
            },
        ];
    } else {
        messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: question },
        ];
    }

    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 2048 }),
    });
    if (!res.ok) return { error: `Groq HTTP ${res.status}` };
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || null;
    return answer ? { answer, provider: "groq" } : { error: "Groq: empty response" };
}

/* ───────── 4. Cerebras (text only — no vision support) ───────── */
async function callCerebras(env, question, systemPrompt, image) {
    if (image) return { error: "Cerebras: vision not supported, skipped" };
    const key = env.CEREBRAS_API_KEY;
    if (!key) return { error: "CEREBRAS_API_KEY not set" };

    const res = await fetch("https://api.cerebras.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "llama-3.3-70b",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: question },
            ],
            temperature: 0.7,
            max_tokens: 2048,
        }),
    });
    if (!res.ok) return { error: `Cerebras HTTP ${res.status}` };
    const data = await res.json();
    const answer = data.choices?.[0]?.message?.content || null;
    return answer ? { answer, provider: "cerebras" } : { error: "Cerebras: empty response" };
}

/* ───────── 5. Cloudflare Workers AI (last resort, same account, no extra key needed) ───────── */
async function callCloudflareAI(env, question, systemPrompt, image) {
    // env.AI is the Workers AI binding — must be added in wrangler config (see notes below),
    // NOT a secret, since it's a native binding rather than an external API key.
    if (!env.AI) return { error: "Workers AI binding not configured" };

    try {
        const model = image ? "@cf/meta/llama-3.2-11b-vision-instruct" : "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
        let input;
        if (image) {
            input = {
                messages: [{ role: "user", content: question || "এই ছবিটি বিশ্লেষণ করো।" }],
                image: Array.from(base64ToBytes(image.base64)),
            };
        } else {
            input = {
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: question },
                ],
            };
        }

        const result = await env.AI.run(model, input);
        const answer = result?.response || result?.result?.response || null;
        return answer ? { answer, provider: "cloudflare-ai" } : { error: "Cloudflare AI: empty response — " + JSON.stringify(result).slice(0, 200) };
    } catch (e) {
        return { error: `Cloudflare AI exception: ${e?.message || JSON.stringify(e) || String(e)}` };
    }
}

function base64ToBytes(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/* ════════════════════════════════════════════════════════════
   DEPLOYMENT NOTES (see also the chat message for exact steps)

   Required secrets (Cloudflare dashboard → Workers & Pages →
   this worker → Settings → Variables and Secrets → "Add" →
   type: Secret):
     GEMINI_API_KEY
     OPENROUTER_API_KEY
     GROQ_API_KEY
     CEREBRAS_API_KEY

   Required binding (same screen, under "Bindings" → "Add" →
   type: Workers AI) — this is NOT a secret, it's a native binding:
     Variable name: AI

   None of these ever appear in client-side code — only this
   worker's environment can read them.
   ════════════════════════════════════════════════════════════ */
// auto-deploy test Sun Jun 28 21:41:51 UTC 2026
