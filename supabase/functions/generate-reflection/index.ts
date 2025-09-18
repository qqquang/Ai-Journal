import { serve } from "https://deno.land/std@0.203.0/http/server.ts";

type RequestPayload = {
  entryId: string;
  goal?: string | null;
  content: string;
};

type ReflectionResponse = {
  reflection: string;
  action?: string;
};

const baseHeaders = new Headers({
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
});

serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: baseHeaders });
  }

  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let payload: RequestPayload;
  try {
    payload = await request.json();
  } catch (_error) {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  const entryId = payload.entryId?.trim();
  const content = payload.content?.trim();
  const goal = payload.goal?.trim() ?? "";

  if (!entryId || !content) {
    return jsonResponse({ error: "Both entryId and content are required." }, 422);
  }

  const aiResponse = await tryGemini(goal, content);

  if (aiResponse) {
    return jsonResponse(aiResponse, 200);
  }

  const reflection = buildReflection(goal, content);
  const action = buildAction(goal, content);

  const response: ReflectionResponse = {
    reflection,
    action,
  };

  return jsonResponse(response, 200);
});

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: baseHeaders,
  });
}

function buildReflection(goal: string, content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  const sentences = normalized
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => sentence.length > 0)
    .slice(0, 3);

  const summary = sentences.length > 0 ? sentences.join(" ") : normalized;
  const tone = deriveTone(normalized);

  let reflection = `You captured: ${summary}`;

  if (goal) {
    reflection += `\n\nKeep your goal of "${goal}" in focus and notice how this entry relates to it.`;
  }

  if (tone) {
    reflection += `\n\nOverall the tone feels ${tone}.`;
  }

  return reflection.trim();
}

function buildAction(goal: string, content: string): string {
  if (goal) {
    return `Identify one concrete step you can take in the next 24 hours to move "${goal}" forward.`;
  }

  const tone = deriveTone(content);
  if (tone === "upbeat") {
    return "Capture what made today energising and schedule more of it for the week ahead.";
  }

  if (tone === "stressed") {
    return "Choose a small restorative habit for tomorrow—like a short walk, journaling break, or a conversation with a friend.";
  }

  return "Note one takeaway from this entry and plan a follow-up action before your next journaling session.";
}

function deriveTone(content: string): "upbeat" | "stressed" | "steady" {
  const lower = content.toLowerCase();
  const positiveHits = matchCount(lower, ["grateful", "excited", "optimistic", "energ", "progress"]);
  const stressedHits = matchCount(lower, ["tired", "worried", "anxious", "overwhelmed", "stressed", "frustrated"]);

  if (positiveHits > stressedHits && positiveHits > 0) {
    return "upbeat";
  }

  if (stressedHits > positiveHits && stressedHits > 0) {
    return "stressed";
  }

  return "steady";
}

function matchCount(target: string, needles: string[]): number {
  return needles.reduce((count, needle) => (target.includes(needle) ? count + 1 : count), 0);
}

async function tryGemini(goal: string, content: string): Promise<ReflectionResponse | null> {
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (!geminiKey) {
    return null;
  }

  try {
    const prompt = [
      "Goal: ",
      goal || "(none provided)",
      "\nJournal entry: ",
      content,
      "\nReturn compact JSON with keys 'reflection' and optional 'action'.",
    ].join("");

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    if (!response.ok) {
      console.error("Gemini request failed", response.status, await response.text());
      return null;
    }

    const completion = await response.json();
    const message: string | undefined = completion?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!message) {
      console.error("Gemini completion missing content", completion);
      return null;
    }

    const parsed = safeJsonParse<ReflectionResponse>(message);
    if (!parsed?.reflection) {
      console.error("Gemini completion did not include reflection", message);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error("Unable to generate reflection via Gemini", error);
    return null;
  }
}

function safeJsonParse<T>(raw: string): T | null {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    console.error("Failed to parse JSON", error, raw);
    return null;
  }
}

/**
 * Replace the heuristic logic above with a real AI call when you are ready:
 *
 * ```ts
 * const response = await fetch(
 *   `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${Deno.env.get('GEMINI_API_KEY')}`,
 *   {
 *     method: 'POST',
 *     headers: { 'Content-Type': 'application/json' },
 *     body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
 *   },
 * });
 * ```
 */
