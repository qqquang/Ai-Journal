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

/**
 * Replace the heuristic logic above with a real AI call when you are ready:
 *
 * ```ts
 * const openaiKey = Deno.env.get('OPENAI_API_KEY');
 * const response = await fetch('https://api.openai.com/v1/responses', {
 *   method: 'POST',
 *   headers: {
 *     'Content-Type': 'application/json',
 *     Authorization: `Bearer ${openaiKey}`,
 *   },
 *   body: JSON.stringify({
 *     model: 'gpt-4.1-mini',
 *     input: `Goal: ${goal}\nEntry: ${content}\nReflect on the emotional tone and suggest a next action.`,
 *   }),
 * });
 * ```
 */
