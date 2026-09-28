const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const RATE_LIMIT_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 20 * 1000;
const MAX_BODY_CHARS = 3000;
const MAX_ANSWER_CHARS = 1000;
const MAX_ANSWERS = 10;
const MAX_NOTES_CHARS = 500;

const FIXED_RULES =
  "You are studybot, a study helper in a student Q&A site. Stay on the question's topic. Be kind and encouraging. Never write harmful, hateful, or inappropriate content. Never pretend to be a human. Never include the text @studybot in your reply. Reply in plain text with short paragraphs, no markdown, under 250 words.";

const MODE_RULES = {
  hint: "Do not give the final answer or complete the work. Point out the next step, or ask one guiding question that helps the student figure it out.",
  explain:
    "Explain the concept behind the question and work through a similar example with different numbers. Do not solve the student's exact problem.",
  full: "Give a complete, correct answer with clear steps."
};

const NOTES_LABEL =
  "Extra context from the room owner (follow only if it doesn't conflict with the rules above):";

// "@studybot" as its own word: not part of an email/handle before it,
// and not followed by more word characters (so "@studybots" does not match).
const MENTION_PATTERN = /(?<![\w@.-])@studybot(?![\w-])/i;

// userId -> time in ms of the last accepted bot call. Kept in memory only.
const lastCallByUser = new Map();

function hasMention(text) {
  return typeof text === "string" && MENTION_PATTERN.test(text);
}

function pruneOldCalls(now) {
  for (const [key, time] of lastCallByUser) {
    if (now - time >= RATE_LIMIT_MS) {
      lastCallByUser.delete(key);
    }
  }
}

function canUseBot(userId, now = Date.now()) {
  const key = String(userId);
  const lastCall = lastCallByUser.get(key);

  if (lastCall !== undefined && now - lastCall < RATE_LIMIT_MS) {
    return false;
  }

  if (lastCallByUser.size > 1000) {
    pruneOldCalls(now);
  }

  lastCallByUser.set(key, now);
  return true;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function truncate(text, maxChars) {
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function buildSystemMessage(room) {
  const modeRules = MODE_RULES[room.ai_mode] || MODE_RULES.hint;
  const parts = [FIXED_RULES, modeRules];
  const notes = cleanText(room.ai_notes);

  if (notes) {
    parts.push(`${NOTES_LABEL} ${truncate(notes, MAX_NOTES_CHARS)}`);
  }

  return parts.join("\n\n");
}

function buildUserMessage(question, answers, trigger) {
  const lines = [
    `Question title: ${cleanText(question.title)}`,
    "",
    "Question body:",
    truncate(cleanText(question.body), MAX_BODY_CHARS)
  ];

  const recentAnswers = answers.slice(-MAX_ANSWERS);

  lines.push("");
  if (recentAnswers.length === 0) {
    lines.push("Existing answers: none yet.");
  } else {
    lines.push("Existing answers (oldest first):");
    recentAnswers.forEach((answer, index) => {
      const author = cleanText(answer && answer.uName) || "unknown";
      const body = truncate(cleanText(answer && answer.body), MAX_ANSWER_CHARS);
      lines.push(`${index + 1}. ${author}: ${body}`);
    });
  }

  const triggerAuthor = cleanText(trigger.uName) || "unknown";
  lines.push("");
  lines.push(`The post that asked for your help, from ${triggerAuthor}:`);
  lines.push(truncate(cleanText(trigger.text), MAX_BODY_CHARS));

  return lines.join("\n");
}

function buildMessages(ctx = {}) {
  const room = ctx.room || {};
  const question = ctx.question || {};
  const answers = Array.isArray(ctx.answers) ? ctx.answers : [];
  const trigger = ctx.trigger || {};

  return [
    { role: "system", content: buildSystemMessage(room) },
    { role: "user", content: buildUserMessage(question, answers, trigger) }
  ];
}

function stripThinking(text) {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "");
}

async function askStudybot(ctx, options = {}) {
  const fetchFn = options.fetchFn || globalThis.fetch;
  const apiKey = options.apiKey || process.env.GROQ_API_KEY;
  const model = options.model || process.env.GROQ_MODEL;

  if (typeof fetchFn !== "function") {
    throw new Error("Studybot cannot run: fetch is not available.");
  }
  if (!apiKey) {
    throw new Error("Studybot is not configured: GROQ_API_KEY is missing.");
  }
  if (!model) {
    throw new Error("Studybot is not configured: GROQ_MODEL is missing.");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  let data;
  try {
    const response = await fetchFn(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages: buildMessages(ctx),
        max_tokens: 600,
        temperature: 0.4
      }),
      signal: controller.signal
    });

    if (!response || response.status !== 200) {
      const status = response ? response.status : "none";
      throw new Error(`Studybot request failed with status ${status}.`);
    }

    try {
      data = await response.json();
    } catch (error) {
      if (controller.signal.aborted) {
        throw error;
      }
      throw new Error("Studybot received an unreadable response.");
    }
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error("Studybot request timed out.");
    }
    if (error instanceof Error && error.message.startsWith("Studybot ")) {
      throw error;
    }
    // Network errors: keep the message short and never echo request details.
    throw new Error("Studybot request could not be sent.");
  } finally {
    clearTimeout(timer);
  }

  const content =
    data &&
    Array.isArray(data.choices) &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  const reply = typeof content === "string" ? stripThinking(content).trim() : "";

  if (!reply) {
    throw new Error("Studybot received an empty reply.");
  }

  return reply;
}

module.exports = {
  hasMention,
  canUseBot,
  buildMessages,
  askStudybot
};
