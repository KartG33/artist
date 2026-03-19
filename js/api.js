// js/api.js — Gemini API

export async function callGemini({ apiKey, model, systemPrompt, messages }) {
  const contents = messages.map(m => ({
    role: m.role === 'user' ? 'user' : 'model',
    parts: [{ text: m.text }]
  }));

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents,
    generationConfig: {
      temperature: 1,
      maxOutputTokens: 8192,
    }
  };

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = err?.error?.message || `HTTP ${res.status}`;
    if (res.status === 400 && msg.includes('API_KEY')) throw new Error('Неверный API ключ');
    if (res.status === 403) throw new Error('Доступ запрещён. Проверь ключ');
    if (res.status === 429) throw new Error('Лимит запросов. Подожди немного');
    throw new Error(msg);
  }

  const data = await res.json();

  // Check for safety blocks
  const candidate = data?.candidates?.[0];
  if (!candidate) {
    const reason = data?.promptFeedback?.blockReason;
    throw new Error(reason ? `Заблокировано: ${reason}` : 'Пустой ответ от модели');
  }
  if (candidate.finishReason === 'SAFETY') {
    throw new Error('Ответ заблокирован фильтром безопасности');
  }

  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Пустой ответ от модели');
  return text;
}
