// js/app.js — Main application

import { logger } from './logger.js';
import {
  loadState, saveState, saveChats, getState,
  AVAILABLE_MODELS,
  getChat, getCurrentChat, createChat, deleteChat, renameChat,
  addMessage, addGlobalBanned, removeGlobalBanned,
  addChatBanned, removeChatBanned, addCustomCommand, removeCustomCommand,
  buildSystemPrompt, parseBannedInput, DEFAULT_SYSTEM_PROMPT, DEFAULT_COMMANDS
} from './store.js';

import { callGemini } from './api.js';

import {
  showToast, renderMessages, appendMessage, showTyping, hideTyping,
  renderHistory, renderCommands, renderBannedTags, renderCustomCmdList,
  scrollBottom, openModal, closeModal, initTabs,
  showConfirm, showRenameDialog, downloadText, downloadJson, readJsonFile
} from './ui.js';

// ============================================================
// INIT
// ============================================================
loadState();
const S = getState();

let isLoading = false;

function init() {
  // Show API modal if no key
  if (!S.apiKey) {
    openModal('apiModal');
  }

  // Sync API fields
  syncApiFields();

  // Init tabs in modals
  document.querySelectorAll('.modal').forEach(m => initTabs(m));

  // Setup all event listeners
  setupHeader();
  setupSidebar();
  setupInputArea();
  setupApiModal();
  setupGlobalSettings();
  setupChatSettings();

  // Load last chat or create new
  if (S.chats.length > 0 && S.currentChatId === null) {
    S.currentChatId = S.chats[0].id;
  }

  refreshAll();
}

// ============================================================
// REFRESH
// ============================================================
function refreshAll() {
  refreshSidebar();
  refreshChat();
  refreshChatSettingsBtn();
}

function refreshSidebar() {
  renderHistory(S.chats, S.currentChatId, selectChat, handleRename, handleDelete);
  renderCommands(DEFAULT_COMMANDS, S.customCommands, S.artistInput, handleCommandClick);
}

function refreshChat() {
  const chat = getCurrentChat();
  if (chat) {
    renderMessages(chat.messages, handleRevise, handleRegen, handleCopy);
  } else {
    renderMessages([], null, null, null);
  }
}

function refreshChatSettingsBtn() {
  const btn = document.getElementById('chatSettingsBtn');
  btn.style.display = S.currentChatId ? 'flex' : 'none';
}

// ============================================================
// HEADER
// ============================================================
function setupHeader() {
  // Burger
  document.getElementById('burgerBtn').onclick = () => {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    sidebar.classList.toggle('open');
    overlay.classList.toggle('visible');
  };
  document.getElementById('sidebarOverlay').onclick = () => {
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay').classList.remove('visible');
  };

  // Artist input
  document.getElementById('artistInput').addEventListener('input', e => {
    S.artistInput = e.target.value;
    renderCommands(DEFAULT_COMMANDS, S.customCommands, S.artistInput, handleCommandClick);
  });

  // New chat
  document.getElementById('newChatBtn').onclick = () => {
    createChat();
    refreshAll();
    closeMobileSidebar();
  };

  // Settings buttons
  document.getElementById('globalSettingsBtn').onclick = openGlobalSettings;
  document.getElementById('chatSettingsBtn').onclick = openChatSettings;
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebarOverlay').classList.remove('visible');
}

// ============================================================
// SIDEBAR
// ============================================================
function setupSidebar() {
  // History export
  document.getElementById('exportHistoryBtn').onclick = () => {
    downloadJson('adpfc_history_export.json', S.chats);
    showToast('История экспортирована', 'ok');
  };

  // History import
  document.getElementById('importHistoryInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (!Array.isArray(data)) throw new Error('Ожидается массив чатов');
      // Merge, no duplicates
      const existingIds = new Set(S.chats.map(c => c.id));
      const newChats = data.filter(c => !existingIds.has(c.id));
      S.chats.unshift(...newChats);
      saveChats();
      refreshAll();
      showToast(`Импортировано ${newChats.length} чатов`, 'ok');
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'err');
    }
    e.target.value = '';
  };
}

function selectChat(id) {
  S.currentChatId = id;
  refreshAll();
  closeMobileSidebar();
}

async function handleRename(id, currentTitle) {
  const newTitle = await showRenameDialog(currentTitle);
  if (newTitle) {
    renameChat(id, newTitle);
    refreshSidebar();
  }
}

async function handleDelete(id, title) {
  const ok = await showConfirm('Удалить чат?', `"${title}" — это действие нельзя отменить.`);
  if (ok) {
    deleteChat(id);
    refreshAll();
  }
}

// ============================================================
// COMMANDS
// ============================================================
function handleCommandClick(text) {
  const textarea = document.getElementById('msgTextarea');
  textarea.value = text;
  autoResizeTextarea(textarea);
  textarea.focus();
  // Cursor to end
  textarea.selectionStart = textarea.selectionEnd = text.length;
  updateSendBtn();
  closeMobileSidebar();
}

// ============================================================
// INPUT AREA
// ============================================================
function setupInputArea() {
  const textarea = document.getElementById('msgTextarea');
  const sendBtn = document.getElementById('sendBtn');

  textarea.addEventListener('input', () => {
    autoResizeTextarea(textarea);
    updateSendBtn();
  });

  textarea.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!isLoading && textarea.value.trim()) send();
    }
  });

  sendBtn.onclick = () => {
    if (!isLoading && document.getElementById('msgTextarea').value.trim()) send();
  };
}

function autoResizeTextarea(el) {
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 150) + 'px';
}

function updateSendBtn() {
  const v = document.getElementById('msgTextarea').value.trim();
  document.getElementById('sendBtn').disabled = isLoading || !v;
}

// ============================================================
// SEND MESSAGE
// ============================================================
async function send() {
  if (!S.apiKey) { openModal('apiModal'); return; }

  const textarea = document.getElementById('msgTextarea');
  const text = textarea.value.trim();
  if (!text || isLoading) return;

  // Ensure chat exists
  if (!S.currentChatId) createChat();

  const chatId = S.currentChatId;
  addMessage(chatId, 'user', text);

  appendMessage({ role: 'user', text }, handleRevise, handleRegen, handleCopy);

  textarea.value = '';
  textarea.style.height = 'auto';
  isLoading = true;
  updateSendBtn();

  showTyping();
  refreshSidebar(); // update message count

  try {
    const chat = getChat(chatId);
    const systemPrompt = buildSystemPrompt(chatId);

    const activeModel = document.getElementById('modelInlineSelect')?.value || S.model;
    const response = await callGemini({
      apiKey: S.apiKey,
      model: activeModel,
      systemPrompt,
      messages: chat.messages // all messages including just-added user msg
        .map(m => ({ role: m.role, text: m.text }))
    });

    hideTyping();
    addMessage(chatId, 'model', response);
    appendMessage({ role: 'model', text: response, model: activeModel }, handleRevise, handleRegen, handleCopy);
    refreshSidebar();
  } catch (err) {
    hideTyping();
    showToast('Ошибка: ' + err.message, 'err');
    // Remove failed user message from store
    const chat = getChat(chatId);
    if (chat) {
      chat.messages = chat.messages.slice(0, -1);
      saveChats();
    }
    // Re-put text in textarea
    document.getElementById('msgTextarea').value = text;
    autoResizeTextarea(document.getElementById('msgTextarea'));
  }

  isLoading = false;
  updateSendBtn();
}

// ============================================================
// MESSAGE ACTIONS
// ============================================================
function handleCopy(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Скопировано', 'ok');
  }).catch(() => {
    showToast('Не удалось скопировать', 'err');
  });
}

function handleRevise(lastText) {
  const textarea = document.getElementById('msgTextarea');
  textarea.value = `REVISE: [опиши что изменить]\n\n---\nПоследний текст:\n${lastText.slice(0, 300)}${lastText.length > 300 ? '…' : ''}`;
  autoResizeTextarea(textarea);
  textarea.focus();
  textarea.selectionStart = 8; // position after "REVISE: "
  textarea.selectionEnd = 8 + 22;
  updateSendBtn();
}

function handleRegen() {
  const chat = getCurrentChat();
  if (!chat) return;
  // Find last user message
  const lastUser = [...chat.messages].reverse().find(m => m.role === 'user');
  if (!lastUser) return;
  const textarea = document.getElementById('msgTextarea');
  textarea.value = lastUser.text;
  autoResizeTextarea(textarea);
  updateSendBtn();
  showToast('Запрос восстановлен. Нажми отправить.', '');
}

// ============================================================
// API MODAL
// ============================================================
function setupApiModal() {
  document.getElementById('apiCancelBtn').onclick = () => {
    if (S.apiKey) closeModal('apiModal');
  };
  document.getElementById('apiSaveBtn').onclick = () => {
    const key = document.getElementById('apiKeyField').value.trim();
    const model = document.getElementById('modelField').value;
    if (!key) { showToast('Введи API ключ', 'err'); return; }
    S.apiKey = key;
    S.model = model;
    saveState();
    syncApiFields();
    closeModal('apiModal');
    showToast('API ключ сохранён', 'ok');
  };
}


function syncModelInlineSelect() {
  const sel = document.getElementById('modelInlineSelect');
  if (!sel) return;
  sel.innerHTML = '';
  AVAILABLE_MODELS.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.value;
    opt.textContent = m.label;
    if (m.value === S.model) opt.selected = true;
    sel.appendChild(opt);
  });
  sel.onchange = () => {
    S.model = sel.value;
    saveState();
    syncApiFields();
  };
}

function syncApiFields() {
  // API modal
  const kf = document.getElementById('apiKeyField');
  const mf = document.getElementById('modelField');
  if (kf) kf.value = S.apiKey || '';
  if (mf) mf.value = S.model || 'gemini-2.5-flash';

  syncModelInlineSelect();

  // Settings API tab
  const gsK = document.getElementById('gsApiKeyField');
  const gsM = document.getElementById('gsModelField');
  if (gsK) gsK.value = S.apiKey || '';
  if (gsM) gsM.value = S.model || 'gemini-2.5-flash';
}

// ============================================================
// GLOBAL SETTINGS
// ============================================================
function openGlobalSettings() {
  syncApiFields();
  document.getElementById('globalPromptField').value = S.systemPrompt;
  renderBannedTags('globalBannedTags', S.globalBanned, word => {
    removeGlobalBanned(word);
    renderBannedTags('globalBannedTags', S.globalBanned, arguments.callee);
  });
  renderCustomCmdList(S.customCommands, id => {
    removeCustomCommand(id);
    renderCustomCmdList(S.customCommands, arguments.callee);
    renderCommands(DEFAULT_COMMANDS, S.customCommands, S.artistInput, handleCommandClick);
  });

  // Reset tabs to first
  const modal = document.getElementById('globalSettingsModal');
  modal.querySelectorAll('.tab-btn').forEach((t, i) => t.classList.toggle('active', i === 0));
  modal.querySelectorAll('.tab-content').forEach((t, i) => t.classList.toggle('hidden', i !== 0));

  openModal('globalSettingsModal');
}

function setupGlobalSettings() {
  document.getElementById('closeGlobalSettings').onclick = () => closeModal('globalSettingsModal');

  // Prompt
  document.getElementById('savePromptBtn').onclick = () => {
    S.systemPrompt = document.getElementById('globalPromptField').value;
    saveState();
    showToast('Промпт сохранён', 'ok');
  };
  document.getElementById('resetPromptBtn').onclick = async () => {
    const ok = await showConfirm('Сбросить промпт?', 'Промпт будет заменён на дефолтный Artist.');
    if (ok) {
      S.systemPrompt = DEFAULT_SYSTEM_PROMPT;
      document.getElementById('globalPromptField').value = DEFAULT_SYSTEM_PROMPT;
      saveState();
      showToast('Промпт сброшен', 'ok');
    }
  };

  // Global Banned — add
  document.getElementById('addGlobalBannedBtn').onclick = () => {
    const input = document.getElementById('globalBannedInput');
    const word = input.value.trim();
    if (!word) return;
    addGlobalBanned(word);
    input.value = '';
    renderBannedTags('globalBannedTags', S.globalBanned, removeAndRefreshGlobal);
  };
  document.getElementById('globalBannedInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addGlobalBannedBtn').click();
  });

  // Convert banned
  document.getElementById('convertBannedBtn').onclick = () => {
    const raw = document.getElementById('bannedConverterInput').value;
    const words = parseBannedInput(raw);
    if (!words.length) { showToast('Ничего не распознано', 'err'); return; }
    words.forEach(w => addGlobalBanned(w));
    renderBannedTags('globalBannedTags', S.globalBanned, removeAndRefreshGlobal);
    document.getElementById('bannedConverterInput').value = '';
    showToast(`Добавлено: ${words.length} слов`, 'ok');
  };

  // Export banned
  document.getElementById('exportBannedBtn').onclick = () => {
    downloadJson('banned_words.json', S.globalBanned);
    showToast('Экспортировано', 'ok');
  };

  // Import banned
  document.getElementById('importBannedInput').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const data = await readJsonFile(file);
      if (!Array.isArray(data)) throw new Error('Ожидается JSON массив');
      data.forEach(w => addGlobalBanned(String(w)));
      renderBannedTags('globalBannedTags', S.globalBanned, removeAndRefreshGlobal);
      showToast(`Импортировано: ${data.length} слов`, 'ok');
    } catch (err) {
      showToast('Ошибка: ' + err.message, 'err');
    }
    e.target.value = '';
  };

  // Export Logs
  const exportLogsBtn = document.getElementById('exportLogsBtn');
  if (exportLogsBtn) exportLogsBtn.onclick = () => {
    downloadText('artist_debug.log', logger.getLogs());
    showToast('Логи сохранены', 'ok');
  };

  // Custom commands
  document.getElementById('addCustomCmdBtn').onclick = () => {
    const name = document.getElementById('newCmdName').value.trim();
    const tmpl = document.getElementById('newCmdTemplate').value.trim();
    if (!name) { showToast('Введи название команды', 'err'); return; }
    if (!tmpl) { showToast('Введи шаблон команды', 'err'); return; }
    addCustomCommand(name, tmpl);
    document.getElementById('newCmdName').value = '';
    document.getElementById('newCmdTemplate').value = '';
    renderCustomCmdList(S.customCommands, removeAndRefreshCmds);
    renderCommands(DEFAULT_COMMANDS, S.customCommands, S.artistInput, handleCommandClick);
    showToast('Команда добавлена', 'ok');
  };

  // API from settings
  document.getElementById('saveApiFromSettingsBtn').onclick = () => {
    const key = document.getElementById('gsApiKeyField').value.trim();
    const model = document.getElementById('gsModelField').value;
    if (!key) { showToast('Введи API ключ', 'err'); return; }
    S.apiKey = key;
    S.model = model;
    saveState();
    syncApiFields();
    const row = document.getElementById('apiStatusRow');
    row.innerHTML = '<span class="api-ok">✓ Сохранено</span>';
    setTimeout(() => { row.innerHTML = ''; }, 2000);
    showToast('Сохранено', 'ok');
  };
}

function removeAndRefreshGlobal(word) {
  removeGlobalBanned(word);
  renderBannedTags('globalBannedTags', S.globalBanned, removeAndRefreshGlobal);
}
function removeAndRefreshCmds(id) {
  removeCustomCommand(id);
  renderCustomCmdList(S.customCommands, removeAndRefreshCmds);
  renderCommands(DEFAULT_COMMANDS, S.customCommands, S.artistInput, handleCommandClick);
}

// ============================================================
// CHAT SETTINGS
// ============================================================
function openChatSettings() {
  const chat = getCurrentChat();
  if (!chat) return;

  // Prompt tab
  document.getElementById('chatPromptOverrideToggle').checked = !!chat.promptOverride;
  document.getElementById('chatPromptField').value = chat.customPrompt || '';

  // Banned tab
  renderBannedTags('chatBannedTags', chat.bannedWords || [], removeAndRefreshChatBanned);

  // Reset tabs
  const modal = document.getElementById('chatSettingsModal');
  modal.querySelectorAll('.tab-btn').forEach((t, i) => t.classList.toggle('active', i === 0));
  modal.querySelectorAll('.tab-content').forEach((t, i) => t.classList.toggle('hidden', i !== 0));

  openModal('chatSettingsModal');
}

function setupChatSettings() {
  document.getElementById('closeChatSettings').onclick = () => closeModal('chatSettingsModal');

  // Chat prompt
  document.getElementById('saveChatPromptBtn').onclick = () => {
    const chat = getCurrentChat();
    if (!chat) return;
    chat.promptOverride = document.getElementById('chatPromptOverrideToggle').checked;
    chat.customPrompt = document.getElementById('chatPromptField').value;
    saveChats();
    showToast('Промпт чата сохранён', 'ok');
  };

  document.getElementById('copyChatGlobalPromptBtn').onclick = () => {
    document.getElementById('chatPromptField').value = S.systemPrompt;
    document.getElementById('chatPromptOverrideToggle').checked = true;
  };

  // Chat banned — add
  document.getElementById('addChatBannedBtn').onclick = () => {
    const chat = getCurrentChat();
    if (!chat) return;
    const input = document.getElementById('chatBannedInput');
    const word = input.value.trim();
    if (!word) return;
    addChatBanned(chat.id, word);
    input.value = '';
    renderBannedTags('chatBannedTags', chat.bannedWords, removeAndRefreshChatBanned);
  };
  document.getElementById('chatBannedInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('addChatBannedBtn').click();
  });

  // Convert chat banned
  document.getElementById('convertChatBannedBtn').onclick = () => {
    const chat = getCurrentChat();
    if (!chat) return;
    const raw = document.getElementById('chatBannedConverterInput').value;
    const words = parseBannedInput(raw);
    if (!words.length) { showToast('Ничего не распознано', 'err'); return; }
    words.forEach(w => addChatBanned(chat.id, w));
    renderBannedTags('chatBannedTags', chat.bannedWords, removeAndRefreshChatBanned);
    document.getElementById('chatBannedConverterInput').value = '';
    showToast(`Добавлено: ${words.length}`, 'ok');
  };

  // Export chat
  document.getElementById('exportChatTxtBtn').onclick = () => {
    const chat = getCurrentChat();
    if (!chat) return;
    const lines = chat.messages.map(m =>
      `[${m.role.toUpperCase()}] ${new Date(m.ts || 0).toLocaleString('ru')}\n${m.text}\n`
    ).join('\n---\n\n');
    downloadText(`${chat.title.replace(/[^\w\sА-яа-я]/g, '_')}.txt`, lines);
    showToast('Экспорт .txt готов', 'ok');
  };

  document.getElementById('exportChatJsonBtn').onclick = () => {
    const chat = getCurrentChat();
    if (!chat) return;
    downloadJson(`${chat.title.replace(/[^\w\sА-яа-я]/g, '_')}.json`, chat);
    showToast('Экспорт .json готов', 'ok');
  };
}

function removeAndRefreshChatBanned(word) {
  const chat = getCurrentChat();
  if (!chat) return;
  removeChatBanned(chat.id, word);
  renderBannedTags('chatBannedTags', chat.bannedWords, removeAndRefreshChatBanned);
}

// ============================================================
// START
// ============================================================
init();
