function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

const MAX_API_BODY_BYTES = 100_000;

function splitCsv(value) {
  return normalizeText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins(env, requestOrigin) {
  const configured = splitCsv(env.ALLOWED_ORIGINS || "");
  if (configured.length > 0) {
    return new Set(configured);
  }
  return new Set([requestOrigin, "http://localhost:8787", "http://127.0.0.1:8787"]);
}

function buildSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
  };
}

function buildCorsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...buildSecurityHeaders(),
      ...extraHeaders,
    },
  });
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  const securityHeaders = buildSecurityHeaders();
  Object.entries(securityHeaders).forEach(([key, value]) => {
    if (!headers.has(key)) {
      headers.set(key, value);
    }
  });
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function getRequestBodySize(request) {
  const contentLength = Number(request.headers.get("content-length") || "0");
  return Number.isFinite(contentLength) ? contentLength : 0;
}

function validateApiRequest(request, env, allowedOrigins) {
  const origin = request.headers.get("origin");
  if (origin && !allowedOrigins.has(origin)) {
    return { status: 403, message: "허용되지 않은 Origin입니다." };
  }

  const expectedApiKey = normalizeText(env.INTERNAL_API_KEY || "");
  if (expectedApiKey) {
    const providedApiKey = normalizeText(request.headers.get("x-api-key") || "");
    if (!providedApiKey || providedApiKey !== expectedApiKey) {
      return { status: 401, message: "API 인증에 실패했습니다." };
    }
  }

  const contentType = (request.headers.get("content-type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return { status: 415, message: "Content-Type은 application/json 이어야 합니다." };
  }

  const bodySize = getRequestBodySize(request);
  if (bodySize > MAX_API_BODY_BYTES) {
    return { status: 413, message: "요청 본문이 너무 큽니다." };
  }

  return null;
}

function fallbackAnalysis(payload) {
  const picked = Array.isArray(payload?.pickedTarots) ? payload.pickedTarots : [];
  const cards = picked.length > 0 ? picked : ["moon"];
  const cardLabelMap = { moon: "월", sun: "태양", star: "별" };
  const cardFlow = cards.map((key) => cardLabelMap[key] || key).join(" -> ");

  return {
    title: "파도를 읽는 조율가",
    quote: "흐름을 읽고 감정을 정돈해 실행력으로 바꾸는 타입",
    status: "안정 회복 구간",
    summary: `선택 카드(${cardFlow}) 기준으로 보면, 과한 확장보다 리듬 회복과 우선순위 정리가 성과를 만듭니다.`,
    todayLine: "지금은 속도를 늦추고 우선순위를 정리하는 것이 가장 큰 성과로 이어집니다.",
    strengths: [
      "감정 기복이 있어도 중심을 다시 세우는 회복 탄력이 높습니다.",
      "관찰력이 좋아 상황 신호를 빠르게 읽고 대응할 수 있습니다.",
      "실행 전 정리 습관이 강해 실수를 줄이는 편입니다.",
    ],
    actions: [
      { title: "20분 정리 산책", description: "움직이면서 오늘의 우선순위 3가지를 정리해 보세요." },
      { title: "한 줄 실행 기록", description: "오늘 완료한 1가지를 기록하면 동기 유지에 도움이 됩니다." },
    ],
  };
}

function sanitizeAnalysis(modelOutput, fallback) {
  if (!modelOutput || typeof modelOutput !== "object") {
    return fallback;
  }

  const strengths = Array.isArray(modelOutput.strengths)
    ? modelOutput.strengths.map(normalizeText).filter(Boolean).slice(0, 3)
    : [];

  const actions = Array.isArray(modelOutput.actions)
    ? modelOutput.actions
        .map((item) => ({
          title: normalizeText(item?.title),
          description: normalizeText(item?.description),
        }))
        .filter((item) => item.title && item.description)
        .slice(0, 2)
    : [];

  return {
    title: normalizeText(modelOutput.title) || fallback.title,
    quote: normalizeText(modelOutput.quote) || fallback.quote,
    status: normalizeText(modelOutput.status) || fallback.status,
    summary: normalizeText(modelOutput.summary) || fallback.summary,
    todayLine: normalizeText(modelOutput.todayLine) || fallback.todayLine,
    strengths: strengths.length === 3 ? strengths : fallback.strengths,
    actions: actions.length === 2 ? actions : fallback.actions,
  };
}

async function callOpenAI(payload, env) {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY가 설정되지 않았습니다. Cloudflare Worker Secret을 확인하세요.");
  }

  const fallback = fallbackAnalysis(payload);
  const prompt = [
    "당신은 한국어 라이프 코치입니다.",
    "입력된 생년월일시, 설문 벡터, 타로 3장(코어/패턴/흐름) 정보를 바탕으로 짧고 실용적인 해석을 작성하세요.",
    "title은 캐릭터 이름처럼 간결하게, todayLine은 1~2문장 요약으로 작성하세요.",
    "반드시 JSON으로만 응답하세요.",
    '스키마: {"title":string,"quote":string,"status":string,"summary":string,"todayLine":string,"strengths":[string,string,string],"actions":[{"title":string,"description":string},{"title":string,"description":string}]}',
    `입력 데이터: ${JSON.stringify(payload)}`,
  ].join("\n");

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: env.OPENAI_MODEL || "gpt-4.1-mini",
      input: prompt,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API 오류 (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const text = normalizeText(data?.output_text || "");
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    return sanitizeAnalysis(parsed, fallback);
  } catch {
    return fallback;
  }
}

async function handleAnalyze(request, env, responseHeaders) {
  let payload = {};
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "JSON 형식이 올바르지 않습니다." }, 400, responseHeaders);
  }

  try {
    const analysis = await callOpenAI(payload, env);
    return jsonResponse({ analysis, source: "openai" }, 200, responseHeaders);
  } catch (error) {
    const analysis = fallbackAnalysis(payload);
    return jsonResponse(
      {
        analysis,
        source: "fallback",
        warning: "분석 엔진 오류로 fallback 결과를 반환합니다.",
      },
      200,
      responseHeaders
    );
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const allowedOrigins = getAllowedOrigins(env, url.origin);
    const corsHeaders = buildCorsHeaders(request.headers.get("origin"), allowedOrigins);

    if (request.method === "POST" && url.pathname === "/api/analyze") {
      const validationError = validateApiRequest(request, env, allowedOrigins);
      if (validationError) {
        return jsonResponse({ error: validationError.message }, validationError.status, corsHeaders);
      }
      return handleAnalyze(request, env, corsHeaders);
    }

    if (request.method === "OPTIONS" && url.pathname === "/api/analyze") {
      return new Response(null, {
        status: 204,
        headers: {
          ...buildSecurityHeaders(),
          ...corsHeaders,
          Allow: "POST, OPTIONS",
        },
      });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return jsonResponse({ error: "허용되지 않은 메서드입니다." }, 405, corsHeaders);
    }

    const staticResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(staticResponse);
  },
};
