const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 8000);
const BACKEND_DIR = __dirname;
const ROOT_DIR = path.resolve(BACKEND_DIR, '..');
const ENV_FILE = path.join(BACKEND_DIR, '.env');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json; charset=utf-8',
};

const MAX_API_BODY_BYTES = 100_000;
const BLOCKED_STATIC_PREFIXES = ['/backend', '/scripts', '/.git', '/.idx', '/.devcontainer'];
const BLOCKED_STATIC_SUFFIXES = ['.md', '.toml', '.nix', '.env', '.example'];

function buildSecurityHeaders() {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'geolocation=(), microphone=(), camera=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://lh3.googleusercontent.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self' https://api.openai.com; frame-ancestors 'none'; base-uri 'self';",
  };
}

function splitCsv(value) {
  return normalizeText(value)
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOrigins(requestOrigin) {
  const configured = splitCsv(process.env.ALLOWED_ORIGINS || '');
  if (configured.length > 0) {
    return new Set(configured);
  }
  return new Set([requestOrigin, 'http://localhost:8000', 'http://127.0.0.1:8000']);
}

function buildCorsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.has(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function sendJson(res, code, body, extraHeaders = {}) {
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    ...buildSecurityHeaders(),
    ...extraHeaders,
  });
  res.end(JSON.stringify(body));
}

function normalizeText(value) {
  if (typeof value === 'string') {
    return value.trim();
  }
  return '';
}

function fallbackAnalysis(payload) {
  const picked = Array.isArray(payload.pickedTarots) ? payload.pickedTarots : [];
  const cards = picked.length > 0 ? picked : ['moon'];
  const cardLabelMap = { moon: '월', sun: '태양', star: '별' };
  const cardFlow = cards.map((key) => cardLabelMap[key] || key).join(' -> ');

  return {
    title: '파도를 읽는 조율가',
    quote: '흐름을 읽고 감정을 정돈해 실행력으로 바꾸는 타입',
    status: '안정 회복 구간',
    summary: `선택 카드(${cardFlow}) 기준으로 보면, 과한 확장보다 리듬 회복과 우선순위 정리가 성과를 만듭니다.`,
    todayLine: '지금은 속도를 늦추고 우선순위를 정리하는 것이 가장 큰 성과로 이어집니다.',
    strengths: [
      '감정 기복이 있어도 중심을 다시 세우는 회복 탄력이 높습니다.',
      '관찰력이 좋아 상황 신호를 빠르게 읽고 대응할 수 있습니다.',
      '실행 전 정리 습관이 강해 실수를 줄이는 편입니다.',
    ],
    actions: [
      { title: '20분 정리 산책', description: '움직이면서 오늘의 우선순위 3가지를 정리해 보세요.' },
      { title: '한 줄 실행 기록', description: '오늘 완료한 1가지를 기록하면 동기 유지에 도움이 됩니다.' },
    ],
  };
}

function sanitizeAnalysis(modelOutput, fallback) {
  if (!modelOutput || typeof modelOutput !== 'object') {
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

async function callOpenAI(payload) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY가 설정되지 않았습니다. backend/.env를 확인하세요.');
  }

  const fallback = fallbackAnalysis(payload);
  const prompt = [
    '당신은 한국어 라이프 코치입니다.',
    '입력된 생년월일시, 설문 벡터, 타로 3장(코어/패턴/흐름) 정보를 바탕으로 짧고 실용적인 해석을 작성하세요.',
    'title은 캐릭터 이름처럼 간결하게, todayLine은 1~2문장 요약으로 작성하세요.',
    '반드시 JSON으로만 응답하세요.',
    '스키마: {"title":string,"quote":string,"status":string,"summary":string,"todayLine":string,"strengths":[string,string,string],"actions":[{"title":string,"description":string},{"title":string,"description":string}]}',
    `입력 데이터: ${JSON.stringify(payload)}`,
  ].join('\n');

  let lastStatus = 0;
  let lastErrorBody = '';
  let data = null;
  const maxAttempts = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        input: prompt,
        temperature: 0.7,
      }),
    });

    if (response.ok) {
      data = await response.json();
      break;
    }

    lastStatus = response.status;
    lastErrorBody = await response.text();
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maxAttempts) {
      throw new Error(`OpenAI API 오류 (${response.status}): ${lastErrorBody}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (!data) {
    throw new Error(`OpenAI API 오류 (${lastStatus}): ${lastErrorBody}`);
  }

  const text = normalizeText(data.output_text || '');
  if (!text) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    return sanitizeAnalysis(parsed, fallback);
  } catch (_) {
    return fallback;
  }
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    let aborted = false;
    req.on('data', (chunk) => {
      if (aborted) {
        return;
      }
      raw += chunk;
      if (raw.length > MAX_API_BODY_BYTES) {
        aborted = true;
        reject(new Error('요청 본문이 너무 큽니다.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error('JSON 형식이 올바르지 않습니다.'));
      }
    });
    req.on('error', reject);
  });
}

function sendStatic(reqPath, res) {
  let relativePath = decodeURIComponent(reqPath);
  if (relativePath === '/') {
    relativePath = '/index.html';
  }
  if (isBlockedStaticPath(relativePath)) {
    sendJson(res, 404, { error: '접근이 허용되지 않은 경로입니다.' });
    return;
  }
  const filePath = path.resolve(ROOT_DIR, `.${relativePath}`);
  if (!filePath.startsWith(ROOT_DIR)) {
    sendJson(res, 403, { error: '접근이 허용되지 않은 경로입니다.' });
    return;
  }
  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      sendJson(res, 404, { error: '파일을 찾을 수 없습니다.' });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME[ext] || 'application/octet-stream';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      ...buildSecurityHeaders(),
    });
    fs.createReadStream(filePath).pipe(res);
  });
}

function isBlockedStaticPath(reqPath) {
  const normalized = normalizeText(reqPath || '');
  if (!normalized) return true;
  if (normalized.includes('/..')) return true;
  if (normalized.startsWith('/.') && !normalized.startsWith('/.well-known/')) return true;
  if (BLOCKED_STATIC_PREFIXES.some((prefix) => normalized === prefix || normalized.startsWith(`${prefix}/`))) {
    return true;
  }
  const lowered = normalized.toLowerCase();
  return BLOCKED_STATIC_SUFFIXES.some((suffix) => lowered.endsWith(suffix));
}

function validateApiRequest(req, allowedOrigins) {
  const origin = normalizeText(req.headers.origin || '');
  if (!origin) {
    return { status: 403, message: 'Origin 헤더가 없는 요청은 허용되지 않습니다.' };
  }
  if (!allowedOrigins.has(origin)) {
    return { status: 403, message: '허용되지 않은 Origin입니다.' };
  }

  const expectedApiKey = normalizeText(process.env.INTERNAL_API_KEY || '');
  if (!expectedApiKey) {
    return { status: 503, message: '서버 보안 설정(INTERNAL_API_KEY)이 필요합니다.' };
  }
  const providedApiKey = normalizeText(req.headers['x-api-key'] || '');
  if (!providedApiKey || providedApiKey !== expectedApiKey) {
    return { status: 401, message: 'API 인증에 실패했습니다.' };
  }

  const contentType = normalizeText(req.headers['content-type'] || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return { status: 415, message: 'Content-Type은 application/json 이어야 합니다.' };
  }

  const contentLength = Number(req.headers['content-length'] || '0');
  if (Number.isFinite(contentLength) && contentLength > MAX_API_BODY_BYTES) {
    return { status: 413, message: '요청 본문이 너무 큽니다.' };
  }

  return null;
}

loadEnvFile(ENV_FILE);

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const requestOrigin = `http://${req.headers.host || 'localhost'}`;
  const allowedOrigins = getAllowedOrigins(requestOrigin);
  const corsHeaders = buildCorsHeaders(req.headers.origin, allowedOrigins);

  if (requestUrl.pathname === '/api/analyze' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      ...buildSecurityHeaders(),
      ...corsHeaders,
      Allow: 'POST, OPTIONS',
    });
    res.end();
    return;
  }

  if (req.method === 'POST' && requestUrl.pathname === '/api/analyze') {
    const validationError = validateApiRequest(req, allowedOrigins);
    if (validationError) {
      sendJson(res, validationError.status, { error: validationError.message }, corsHeaders);
      return;
    }

    const payload = await readJsonBody(req).catch((error) => {
      sendJson(res, 400, { error: error.message || '요청 본문 오류' }, corsHeaders);
      return null;
    });
    if (!payload) {
      return;
    }

    try {
      const analysis = await callOpenAI(payload);
      sendJson(res, 200, { analysis, source: 'openai' }, corsHeaders);
    } catch (error) {
      const analysis = fallbackAnalysis(payload);
      sendJson(res, 200, {
        analysis,
        source: 'fallback',
        warning: '분석 엔진 오류로 fallback 결과를 반환합니다.',
      }, corsHeaders);
    }
    return;
  }

  if (req.method === 'GET' || req.method === 'HEAD') {
    sendStatic(requestUrl.pathname, res);
    return;
  }

  sendJson(res, 405, { error: '허용되지 않은 메서드입니다.' }, corsHeaders);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  if (!process.env.OPENAI_API_KEY) {
    console.log('Warning: OPENAI_API_KEY is not set. /api/analyze will return an error.');
  }
});
