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

/* ════════════════════════════════════════════════════════════
   KEY / MODEL ROTATION + RETRY ENGINE
   প্রতিটা provider-এ একাধিক key এবং/অথবা একাধিক model থাকতে পারে।
   কোনো key/model 429 (rate-limit), 5xx, বা timeout দিলে পরবর্তী
   key/model এ smoothly সরে যাবে — এবং পুরো provider list শেষ হয়ে
   গেলেও ছোট exponential-backoff delay দিয়ে পুরো cycle আরেকবার
   চেষ্টা করবে (সর্বোচ্চ MAX_ROTATION_ROUNDS বার), যাতে সাময়িক
   rate-limit এ পুরো request fail না হয়ে যায়।
   ════════════════════════════════════════════════════════════ */
const MAX_ROTATION_ROUNDS = 2; // পুরো key/model লিস্ট কতবার আবার চেষ্টা করবে
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

// একটা single fetch-attempt কে wrap করে — নির্দিষ্ট HTTP status এ retryable বলে চিহ্নিত করে,
// network exception ধরেও সেটাকে retryable error হিসেবে ফেরত দেয় (throw করে caller থামায় না)।
async function attemptWithStatus(fn) {
    try {
        return await fn();
    } catch (e) {
        return { __exception: true, message: String(e?.message || e) };
    }
}

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

        const url = new URL(request.url);
        const path = url.pathname;

        // ── OCR endpoint ──
        if (path === "/ocr-page") {
            return handleOcrPage(body, env);
        }
        if (path === "/ocr-status") {
            return handleOcrStatus(body, env);
        }
        // ── MCQ-from-PDF endpoint: fetches the PDF server-side and sends it directly
        //    to Gemini (which reads PDFs natively), avoiding client-side text extraction
        //    that fails on scanned/image-based pages. ──
        if (path === "/mcq-from-pdf") {
            return handleMcqFromPdf(body, env);
        }

        // ── Default AI proxy ──
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

        // প্রতিটা provider নিজের ভেতরেই key/model rotation + backoff করে (উপরে দেখো)।
        // এখানে শুধু provider-চেইন ক্রমে চালানো হয় — কোনো একটায় সব key/model fail করলে
        // পরের provider এ চলে যায়, একদম শেষ পর্যন্ত কেউ সফল না হলে সংক্ষিপ্ত বিরতি দিয়ে
        // পুরো চেইন আরেকবার চেষ্টা করে — তাই সাময়িক outage এ পুরো request ব্যর্থ হয় না।
        const errors = [];
        for (let chainRound = 0; chainRound < 2; chainRound++) {
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
            if (chainRound === 0) await sleep(600); // পুরো চেইন একবার ব্যর্থ হলে ছোট বিরতি দিয়ে আবার
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

/* ───────── 1. Google Gemini — multi-key × multi-model rotation + backoff ───────── */
function getGeminiKeys(env) {
    const keys = [];
    if (env.GEMINI_KEYS) keys.push(...env.GEMINI_KEYS.split(",").map(k => k.trim()).filter(Boolean));
    if (env.GEMINI_API_KEY) keys.push(env.GEMINI_API_KEY.trim());
    return [...new Set(keys)];
}

// নতুন মডেল আসলে/পুরনো deprecate হলে শুধু এই array আপডেট করলেই rotation এ যুক্ত হয়ে যাবে।
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

async function callGeminiOnce(key, model, parts, maxOutputTokens) {
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ contents: [{ parts }], generationConfig: { maxOutputTokens, temperature: 0.7 } }),
        }
    );
    return res;
}

async function callGemini(env, question, systemPrompt, image) {
    const keys = getGeminiKeys(env);
    if (!keys.length) return { error: "GEMINI_API_KEY not set" };

    const parts = [];
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.base64 } });
    parts.push({ text: systemPrompt + "\n\nপ্রশ্ন: " + (question || "এই ছবিটি বিশ্লেষণ করো।") });

    let lastError = "Gemini: no keys/models worked";

    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
        for (const model of GEMINI_MODELS) {
            for (const key of keys) {
                const outcome = await attemptWithStatus(() => callGeminiOnce(key, model, parts, 8192));

                if (outcome.__exception) { lastError = `Gemini(${model}) exception: ${outcome.message}`; continue; }

                if (!outcome.ok) {
                    lastError = `Gemini(${model}) HTTP ${outcome.status}`;
                    // রেট-লিমিট/সার্ভার এরর হলে এই key/model স্কিপ করে পরেরটায় যাও — থামবে না
                    continue;
                }
                const data = await outcome.json().catch(() => null);
                const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
                if (answer) return { answer, provider: `gemini:${model}` };
                lastError = `Gemini(${model}): empty response`;
            }
        }
        // একটা পুরো round (সব model × সব key) ব্যর্থ হলে সংক্ষিপ্ত backoff দিয়ে আবার চেষ্টা
        if (round < MAX_ROTATION_ROUNDS - 1) await sleep(400 * (round + 1));
    }
    return { error: lastError };
}

/* ───────── 2. OpenRouter (free vision model) — multi-key × multi-model rotation ───────── */
function getOpenRouterKeys(env) {
    const keys = [];
    if (env.OPENROUTER_KEYS) keys.push(...env.OPENROUTER_KEYS.split(",").map(k => k.trim()).filter(Boolean));
    if (env.OPENROUTER_API_KEY) keys.push(env.OPENROUTER_API_KEY.trim());
    return [...new Set(keys)];
}
const OPENROUTER_MODELS = ["qwen/qwen2.5-vl-72b-instruct:free", "meta-llama/llama-3.2-11b-vision-instruct:free"];

async function callOpenRouter(env, question, systemPrompt, image) {
    const keys = getOpenRouterKeys(env);
    if (!keys.length) return { error: "OPENROUTER_API_KEY not set" };

    let userContent;
    if (image) {
        userContent = [
            { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
            { type: "text", text: question || "এই ছবিটি বিশ্লেষণ করো এবং বাংলায় ব্যাখ্যা দাও।" },
        ];
    } else {
        userContent = question;
    }

    let lastError = "OpenRouter: no keys/models worked";
    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
        for (const model of OPENROUTER_MODELS) {
            for (const key of keys) {
                const outcome = await attemptWithStatus(() => fetch("https://openrouter.ai/api/v1/chat/completions", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: userContent },
                        ],
                        temperature: 0.7,
                        max_tokens: 8192,
                    }),
                }));
                if (outcome.__exception) { lastError = `OpenRouter(${model}) exception: ${outcome.message}`; continue; }
                if (!outcome.ok) { lastError = `OpenRouter(${model}) HTTP ${outcome.status}`; continue; }
                const data = await outcome.json().catch(() => null);
                const answer = data?.choices?.[0]?.message?.content || null;
                if (answer) return { answer, provider: `openrouter:${model}` };
                lastError = `OpenRouter(${model}): empty response`;
            }
        }
        if (round < MAX_ROTATION_ROUNDS - 1) await sleep(400 * (round + 1));
    }
    return { error: lastError };
}

/* ───────── 3. Groq — multi-key rotation, per-modality model fallback list ───────── */
function getGroqKeys(env) {
    const keys = [];
    if (env.GROQ_KEYS) keys.push(...env.GROQ_KEYS.split(",").map(k => k.trim()).filter(Boolean));
    if (env.GROQ_API_KEY) keys.push(env.GROQ_API_KEY.trim());
    return [...new Set(keys)];
}
const GROQ_TEXT_MODELS  = ["openai/gpt-oss-120b", "llama-3.3-70b-versatile"];
const GROQ_IMAGE_MODELS = ["meta-llama/llama-4-maverick-17b-128e-instruct", "meta-llama/llama-4-scout-17b-16e-instruct"];

async function callGroq(env, question, systemPrompt, image) {
    const keys = getGroqKeys(env);
    if (!keys.length) return { error: "GROQ_API_KEY not set" };
    const models = image ? GROQ_IMAGE_MODELS : GROQ_TEXT_MODELS;

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

    let lastError = "Groq: no keys/models worked";
    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
        for (const model of models) {
            for (const key of keys) {
                const outcome = await attemptWithStatus(() => fetch("https://api.groq.com/openai/v1/chat/completions", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                    body: JSON.stringify({ model, messages, temperature: 0.7, max_tokens: 4096 }),
                }));
                if (outcome.__exception) { lastError = `Groq(${model}) exception: ${outcome.message}`; continue; }
                if (!outcome.ok) { lastError = `Groq(${model}) HTTP ${outcome.status}`; continue; }
                const data = await outcome.json().catch(() => null);
                const answer = data?.choices?.[0]?.message?.content || null;
                if (answer) return { answer, provider: `groq:${model}` };
                lastError = `Groq(${model}): empty response`;
            }
        }
        if (round < MAX_ROTATION_ROUNDS - 1) await sleep(400 * (round + 1));
    }
    return { error: lastError };
}

/* ───────── 4. Cerebras (text only — no vision support) — multi-key × multi-model ───────── */
function getCerebrasKeys(env) {
    const keys = [];
    if (env.CEREBRAS_KEYS) keys.push(...env.CEREBRAS_KEYS.split(",").map(k => k.trim()).filter(Boolean));
    if (env.CEREBRAS_API_KEY) keys.push(env.CEREBRAS_API_KEY.trim());
    return [...new Set(keys)];
}
const CEREBRAS_MODELS = ["gpt-oss-120b", "llama-3.3-70b"];

async function callCerebras(env, question, systemPrompt, image) {
    if (image) return { error: "Cerebras: vision not supported, skipped" };
    const keys = getCerebrasKeys(env);
    if (!keys.length) return { error: "CEREBRAS_API_KEY not set" };

    let lastError = "Cerebras: no keys/models worked";
    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
        for (const model of CEREBRAS_MODELS) {
            for (const key of keys) {
                const outcome = await attemptWithStatus(() => fetch("https://api.cerebras.ai/v1/chat/completions", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
                    body: JSON.stringify({
                        model,
                        messages: [
                            { role: "system", content: systemPrompt },
                            { role: "user", content: question },
                        ],
                        temperature: 0.7,
                        max_tokens: 4096,
                    }),
                }));
                if (outcome.__exception) { lastError = `Cerebras(${model}) exception: ${outcome.message}`; continue; }
                if (!outcome.ok) { lastError = `Cerebras(${model}) HTTP ${outcome.status}`; continue; }
                const data = await outcome.json().catch(() => null);
                const answer = data?.choices?.[0]?.message?.content || null;
                if (answer) return { answer, provider: `cerebras:${model}` };
                lastError = `Cerebras(${model}): empty response`;
            }
        }
        if (round < MAX_ROTATION_ROUNDS - 1) await sleep(400 * (round + 1));
    }
    return { error: lastError };
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
   OCR ENDPOINTS
   POST /ocr-page   — extract text from a single page image
   POST /ocr-status — get OCR progress for a pdf_id
   ════════════════════════════════════════════════════════════ */

const OCR_SYSTEM_PROMPT = `তুমি একটি OCR সিস্টেম। এই বইয়ের পেইজের ছবি থেকে সমস্ত টেক্সট হুবহু বের করো।

নিয়ম:
১. পেইজের প্রতিটি অক্ষর, শব্দ, বাক্য, সংখ্যা, সূত্র — সব বের করো।
২. টেক্সটের ক্রম এবং layout ঠিক রাখো (লাইন break, paragraph structure)।
৩. বাংলা, ইংরেজি, গণিতের সূত্র — সব ধরনের টেক্সট বের করো।
৪. শুধু extracted text দাও — কোনো ব্যাখ্যা, মন্তব্য বা markdown ছাড়া।
৫. ছবিতে কোনো টেক্সট না থাকলে শুধু লেখো: [NO_TEXT]`;

// Google Lens-স্টাইল click-to-copy এর জন্য word-level bounding box সহ OCR প্রম্পট।
// Gemini-কেই এটার জন্য ব্যবহার করা হয় (structured JSON output-এ সবচেয়ে নির্ভরযোগ্য)।
// x,y,w,h সব শতাংশ (0-100) হিসেবে — যাতে ফ্রন্টএন্ডে যেকোনো zoom/resolution-এ কাজ করে,
// পিক্সেল-নির্ভর কো-অর্ডিনেট হলে zoom বদলালে align ভেঙে যেত।
const OCR_BOXES_SYSTEM_PROMPT = `তুমি একটি OCR সিস্টেম যা বইয়ের পেইজের ছবি থেকে প্রতিটি শব্দ/শব্দগুচ্ছ এবং তার অবস্থান বের করে।

নিয়ম:
১. পেইজের প্রতিটি লাইনকে কয়েকটি অংশে (word বা ছোট phrase, প্রায় ২-৬ শব্দ করে) ভাগ করো।
২. প্রতিটি অংশের জন্য bounding box দাও — পুরো ছবির উচ্চতা/প্রস্থের শতাংশ (%) হিসেবে, ০ থেকে ১০০ এর মধ্যে সংখ্যা।
৩. শুধুমাত্র নিচের JSON array ফরম্যাটে উত্তর দাও, অন্য কিছু লিখো না (কোনো markdown code fence না, কোনো ব্যাখ্যা না):
[{"t":"টেক্সট অংশ","x":12.5,"y":8.3,"w":20.1,"h":3.2}, ...]
যেখানে x,y = বাম-উপরের কোণার position (%), w,h = width/height (%)।
৪. বাংলা, ইংরেজি, গণিতের সূত্র — সব ধরনের টেক্সট কভার করো।
৫. ছবিতে কোনো টেক্সট না থাকলে শুধু লেখো: []`;

async function handleOcrPage(body, env) {
    const { pdf_id, page_number, image_base64, image_mime, supabase_url, supabase_key } = body;
    if (!pdf_id || !page_number || !image_base64) {
        return jsonResponse({ success: false, error: "pdf_id, page_number, image_base64 required" }, 400);
    }

    const sbUrl = supabase_url || env.SUPABASE_URL;
    const sbKey = supabase_key || env.SUPABASE_KEY;
    if (!sbUrl || !sbKey) return jsonResponse({ success: false, error: "Supabase credentials missing" }, 500);

    // Mark page as processing
    await ocrDbUpsert(sbUrl, sbKey, {
        pdf_id: parseInt(pdf_id),
        page_number: parseInt(page_number),
        ocr_status: "processing",
        ocr_attempts: 1,
        updated_at: new Date().toISOString()
    });

    // Run strong multi-provider OCR (full text) + bounding-box OCR (Google Lens-style selection) — সমান্তরালে
    const [extractedText, wordBoxes] = await Promise.all([
        runStrongOcr(env, image_base64, image_mime || "image/jpeg"),
        callGeminiOcrBoxes(env, { base64: image_base64, mimeType: image_mime || "image/jpeg" })
    ]);

    const isEmpty = !extractedText ||
        extractedText.trim() === "[NO_TEXT]" ||
        extractedText.trim().length < 5;
    const wordCount = isEmpty ? 0 : extractedText.trim().split(/\s+/).length;

    // Save result — word_boxes ব্যর্থ হলে null থাকে, ফ্রন্টএন্ড তখন plain full-text layer-এ fallback করবে
    await ocrDbUpsert(sbUrl, sbKey, {
        pdf_id: parseInt(pdf_id),
        page_number: parseInt(page_number),
        extracted_text: isEmpty ? null : extractedText.trim(),
        word_boxes: wordBoxes && wordBoxes.length ? JSON.stringify(wordBoxes) : null,
        ocr_status: isEmpty ? "empty" : "done",
        word_count: wordCount,
        updated_at: new Date().toISOString()
    });

    // Update job progress
    try {
        const jobRes = await ocrDbGet(sbUrl, sbKey,
            `book_pdf_ocr_jobs?pdf_id=eq.${pdf_id}&select=done_pages,total_pages`);
        if (jobRes?.length) {
            const newDone = (jobRes[0].done_pages || 0) + 1;
            const isDone = newDone >= (jobRes[0].total_pages || 1);
            await ocrDbPatch(sbUrl, sbKey, `book_pdf_ocr_jobs?pdf_id=eq.${pdf_id}`, {
                done_pages: newDone,
                status: isDone ? "done" : "processing",
                finished_at: isDone ? new Date().toISOString() : null
            });
        }
    } catch (_) {}

    return jsonResponse({
        success: true,
        page_number: parseInt(page_number),
        text_length: extractedText?.length || 0,
        word_count: wordCount,
        boxes_captured: !!(wordBoxes && wordBoxes.length),
        status: isEmpty ? "empty" : "done"
    });
}

async function handleOcrStatus(body, env) {
    const { pdf_id, supabase_url, supabase_key } = body;
    if (!pdf_id) return jsonResponse({ success: false, error: "pdf_id required" }, 400);

    const sbUrl = supabase_url || env.SUPABASE_URL;
    const sbKey = supabase_key || env.SUPABASE_KEY;

    const [job, pages] = await Promise.all([
        ocrDbGet(sbUrl, sbKey, `book_pdf_ocr_jobs?pdf_id=eq.${pdf_id}&select=*`),
        ocrDbGet(sbUrl, sbKey,
            `book_pdf_pages?pdf_id=eq.${pdf_id}&select=page_number,ocr_status,word_count&order=page_number.asc`)
    ]);

    return jsonResponse({ success: true, job: job?.[0] || null, pages: pages || [] });
}

/* Strong OCR: try multiple vision providers, pick best (longest) result */
async function runStrongOcr(env, imageBase64, mimeType) {
    const image = { base64: imageBase64, mimeType };
    const results = [];

    // Run providers in parallel for speed
    const [r1, r2, r3] = await Promise.allSettled([
        callGeminiOcr(env, image),
        callOpenRouterOcr(env, image),
        callGroqOcr(env, image)
    ]);

    for (const r of [r1, r2, r3]) {
        if (r.status === "fulfilled" && r.value && r.value.length > 10) {
            results.push(r.value);
        }
    }

    if (!results.length) return null;
    // Return longest result (most complete extraction)
    return results.sort((a, b) => b.length - a.length)[0];
}

async function callGeminiOcr(env, image) {
    const key = env.GEMINI_API_KEY;
    if (!key) return null;
    const parts = [
        { inline_data: { mime_type: image.mimeType, data: image.base64 } },
        { text: OCR_SYSTEM_PROMPT }
    ];
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { maxOutputTokens: 8192, temperature: 0 }
            })
        }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || null;
    return text && text !== "[NO_TEXT]" ? text : null;
}

// Google Lens-স্টাইল সিলেকশনের জন্য word-level bounding box বের করে (Gemini দিয়েই, যেহেতু
// structured JSON output-এ এটাই সবচেয়ে নির্ভরযোগ্য)। ব্যর্থ হলে null রিটার্ন করে —
// caller তখন plain full-page text layer-এ fallback করবে, কোনো ফিচার ভাঙবে না।
async function callGeminiOcrBoxes(env, image) {
    const key = env.GEMINI_API_KEY;
    if (!key) return null;
    const parts = [
        { inline_data: { mime_type: image.mimeType, data: image.base64 } },
        { text: OCR_BOXES_SYSTEM_PROMPT }
    ];
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts }],
                    generationConfig: { maxOutputTokens: 8192, temperature: 0, responseMimeType: "application/json" }
                })
            }
        );
        if (!res.ok) return null;
        const data = await res.json();
        const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!raw) return null;
        // মাঝেমধ্যে model markdown fence দিয়ে wrap করে ফেলতে পারে (```json ... ```) — সেটা strip করি
        const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/,'').replace(/```\s*$/,'');
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed)) return null;
        // Sanity-check প্রতিটা entry — malformed হলে বাদ দেই, পুরো response বাতিল না করে
        const valid = parsed.filter(it =>
            it && typeof it.t === 'string' && it.t.trim() &&
            typeof it.x === 'number' && typeof it.y === 'number' &&
            typeof it.w === 'number' && typeof it.h === 'number'
        );
        return valid.length ? valid : null;
    } catch (_) {
        return null; // parse error বা অন্য যেকোনো ব্যর্থতায় নিরাপদে null — fallback চলবে
    }
}

async function callOpenRouterOcr(env, image) {
    const key = env.OPENROUTER_API_KEY;
    if (!key) return null;
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "qwen/qwen2.5-vl-72b-instruct:free",
            messages: [
                { role: "system", content: OCR_SYSTEM_PROMPT },
                { role: "user", content: [
                    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
                    { type: "text", text: "এই পেইজের সব টেক্সট extract করো।" }
                ]}
            ],
            temperature: 0, max_tokens: 8192
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || null;
    return text && text !== "[NO_TEXT]" ? text : null;
}

async function callGroqOcr(env, image) {
    const key = env.GROQ_API_KEY;
    if (!key) return null;
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
            model: "meta-llama/llama-4-maverick-17b-128e-instruct",
            messages: [
                { role: "system", content: OCR_SYSTEM_PROMPT },
                { role: "user", content: [
                    { type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.base64}` } },
                    { type: "text", text: "এই পেইজের সব টেক্সট extract করো।" }
                ]}
            ],
            temperature: 0, max_tokens: 4096
        })
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || null;
    return text && text !== "[NO_TEXT]" ? text : null;
}

/* Supabase helpers for OCR */
async function ocrDbUpsert(url, key, data) {
    await fetch(`${url}/rest/v1/book_pdf_pages`, {
        method: "POST",
        headers: {
            apikey: key, Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(data)
    });
}

async function ocrDbPatch(url, key, path, data) {
    await fetch(`${url}/rest/v1/${path}`, {
        method: "PATCH",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify(data)
    });
}

async function ocrDbGet(url, key, path) {
    const res = await fetch(`${url}/rest/v1/${path}`, {
        headers: { apikey: key, Authorization: `Bearer ${key}` }
    });
    if (!res.ok) return null;
    return res.json();
}

/* ───────── MCQ-from-PDF: fetch the whole PDF and let Gemini read it natively ───────── */
async function handleMcqFromPdf(body, env) {
    const { pdf_url, prompt } = body;
    if (!pdf_url) return jsonResponse({ success: false, error: "pdf_url প্রয়োজন" }, 400);
    if (!prompt) return jsonResponse({ success: false, error: "prompt প্রয়োজন" }, 400);

    const keys = getGeminiKeys(env);
    if (!keys.length) return jsonResponse({ success: false, error: "GEMINI_API_KEY not set" }, 500);

    let pdfBase64;
    try {
        const pdfRes = await fetch(pdf_url);
        if (!pdfRes.ok) return jsonResponse({ success: false, error: `PDF fetch failed: HTTP ${pdfRes.status}` }, 502);
        const buf = await pdfRes.arrayBuffer();
        // Reject PDFs that are too large for Gemini's inline-data limit (~20MB raw, smaller after base64
        // overhead) — large files were also causing the worker to crash/timeout during base64 conversion.
        if (buf.byteLength > 15 * 1024 * 1024) {
            return jsonResponse({ success: false, error: "PDF too large (max ~15MB) for direct AI processing" }, 413);
        }
        const u8 = new Uint8Array(buf);
        const CHUNK = 0x8000; // 32KB — safe chunk size, avoids spread-operator stack issues on large arrays
        const chunks = [];
        for (let i = 0; i < u8.length; i += CHUNK) {
            chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + CHUNK)));
        }
        pdfBase64 = btoa(chunks.join(""));
    } catch (e) {
        return jsonResponse({ success: false, error: `PDF fetch exception: ${e?.message || e}` }, 502);
    }

    const pdfParts = [
        { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
        { text: prompt },
    ];

    let lastError = "Gemini: no keys/models worked";
    for (let round = 0; round < MAX_ROTATION_ROUNDS; round++) {
        for (const model of GEMINI_MODELS) {
            for (const key of keys) {
                const outcome = await attemptWithStatus(() => callGeminiOnce(key, model, pdfParts, 8192));
                if (outcome.__exception) { lastError = `Gemini(${model}) exception: ${outcome.message}`; continue; }
                if (!outcome.ok) { lastError = `Gemini(${model}) HTTP ${outcome.status}`; continue; }
                const data = await outcome.json().catch(() => null);
                const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
                if (answer) return jsonResponse({ success: true, answer, provider: `gemini-pdf:${model}` });
                lastError = `Gemini(${model}): empty response`;
            }
        }
        if (round < MAX_ROTATION_ROUNDS - 1) await sleep(400 * (round + 1));
    }
    return jsonResponse({ success: false, error: lastError }, 502);
}

/* ════════════════════════════════════════════════════════════
   DEPLOYMENT NOTES (see also the chat message for exact steps)

   Required secrets (Cloudflare dashboard → Workers & Pages →
   this worker → Settings → Variables and Secrets → "Add" →
   type: Secret):
     GEMINI_API_KEY      (single key — backward compatible)
     OPENROUTER_API_KEY
     GROQ_API_KEY
     CEREBRAS_API_KEY

   Optional — MULTI-KEY ROTATION (recommended for production load):
   Add comma-separated keys to enable rotation across multiple
   accounts/quotas. When both singular and plural are set, both
   are merged and de-duplicated.
     GEMINI_KEYS      = key1,key2,key3
     OPENROUTER_KEYS  = key1,key2
     GROQ_KEYS        = key1,key2
     CEREBRAS_KEYS    = key1,key2

   Rotation behavior: each provider tries every (model × key)
   combination before giving up; a 429/5xx/timeout on one key
   or model moves smoothly to the next without failing the whole
   request. If an entire provider's key/model list is exhausted,
   a short backoff delay is applied and the whole list is retried
   once more (MAX_ROTATION_ROUNDS). If every provider in the chain
   fails once, the entire provider chain is retried once after a
   600ms pause before giving up and returning an error to the client.

   Required binding (same screen, under "Bindings" → "Add" →
   type: Workers AI) — this is NOT a secret, it's a native binding:
     Variable name: AI

   None of these ever appear in client-side code — only this
   worker's environment can read them.
   ════════════════════════════════════════════════════════════ */
// auto-deploy test Sun Jun 28 21:41:51 UTC 2026

