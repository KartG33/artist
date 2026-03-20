// js/api.js — Gemini API

import { logger } from './logger.js';

// Models with "thinking: true" don't accept temperature param — causes 400
const THINKING_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
  'gemini-3.1-pro-preview',
];

export async function callGemini({ apiKey, model, systemPrompt, messages }) {
  logger.info(`Calling Gemini with model: ${model}`);
  logger.debug('System prompt:', systemPrompt.slice(0, 100) + '...');
  logger.debug('Messages count:', messages.length);

  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  const isThinking = THINKING_MODELS.includes(model);

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      ...(isThinking ? {} : { temperature: 1 }),
      maxOutputTokens: 8192,
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  logger.debug('Request body:', { ...body, system_instruction: '...' });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    logger.error(`Gemini API error: ${res.status}`, msg);
    if (res.status === 400 && msg.includes('API_KEY')) throw new Error('Неверный API ключ');
    if (res.status === 403) throw new Error('Доступ запрещён. Проверь ключ');
    if (res.status === 429) throw new Error('Лимит запросов. Подожди немного');
    throw new Error(msg);
  }

  const data = await res.json();
  logger.debug('Gemini response data:', data);

  // Check for safety blocks
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    logger.warn('Gemini response blocked:', reason);
    throw new Error(`Ответ заблокирован: ${reason || 'неизвестная причина'}`);
  }

  return candidate.content.parts.map(p => p.text).join('');
}
