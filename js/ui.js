// js/ui.js — UI rendering helpers

import { logger } from './logger.js';

// ---- TOAST ----
export function showToast(msg, type = '') {
  logger.debug(`Showing toast: "${msg}" (type: ${type})`);
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = 'toast' + (type ? ` ${type}` : '');
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ---- FORMAT MESSAGE TEXT ----
export function formatText(raw) {
  let t = escHtml(raw);
  // Fenced code blocks
  t = t.replace(/```([\w]*)\n?([\s\S]*?)```/g, (_, lang, code) =>
    `<pre><code>${code.trim()}</code></pre>`
  );
  // Inline code
  t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  // Bold
  t = t.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  t = t.replace(/\*(.+?)\*/g, '<em>$1</em>');
  return t;
}

function escHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ---- RENDER MESSAGES ----
export function renderMessages(messages, onRevise, onRegen, onCopy) {
  logger.debug(`Rendering ${messages.length} messages.`);
  const el = document.getElementById('messages');
  el.innerHTML = '';

  if (!messages || messages.length === 0) {
    el.appendChild(makeWelcome());
    return;
  }

  messages.forEach((msg, i) => {
    el.appendChild(makeMsgEl(msg, i, onRevise, onRegen, onCopy));
  });
  scrollBottom();
}

export function appendMessage(msg, onRevise, onRegen, onCopy) {
  logger.debug(`Appending ${msg.role} message.`);
  // Remove welcome if present
  const w = document.getElementById('welcome');
  if (w) w.remove();

  const el = document.getElementById('messages');
  el.appendChild(makeMsgEl(msg, null, onRevise, onRegen, onCopy));
  scrollBottom();
}

function makeMsgEl(msg, idx, onRevise, onRegen, onCopy) {
  const div = document.createElement('div');
  div.className = `msg ${msg.role}`;

  const modelBadge = (msg.role === 'model' && msg.model) ? ` <span class="msg-model-badge">${msg.model.replace('gemini-','').replace('-preview','')}</span>` : '';
  const roleLabel = msg.role === 'user' ? '▸ ВЫ' : `◆ ADP-FC${modelBadge}`;
  let html = `<div class="msg-role">${roleLabel}</div>
    <div class="msg-bubble">${formatText(msg.text)}</div>`;

  if (msg.role === 'model') {
    html += `<div class="msg-actions">
      <button class="msg-act-btn copy">📋 Копировать</button>
      <button class="msg-act-btn regen">↺ Regenerate</button>
      <button class="msg-act-btn revise">✏ Revise</button>
    </div>`;
  }

  div.innerHTML = html;

  if (msg.role === 'model') {
    div.querySelector('.copy').onclick  = () => onCopy && onCopy(msg.text);
    div.querySelector('.regen').onclick = () => onRegen && onRegen();
    div.querySelector('.revise').onclick= () => onRevise && onRevise(msg.text);
  }

  return div;
}

function makeWelcome() {
  logger.debug('Rendering welcome screen.');
  const div = document.createElement('div');
  div.className = 'welcome';
  div.id = 'welcome';
  div.innerHTML = `
    <div class="welcome-glyph">◈</div>
    <div class="welcome-title">Artist</div>
    <div class="welcome-sub">Студия создания текстов и Suno/Udio промптов на базе Gemini</div>
    <div class="welcome-cards">
      <div class="welcome-card"><div class="wc-icon">①</div><div>Введи исполнителя в поле вверху</div></div>
      <div class="welcome-card"><div class="wc-icon">②</div><div>Нажми команду в боковой панели</div></div>
      <div class="welcome-card"><div class="wc-icon">③</div><div>Или просто напиши в чат</div></div>
    </div>`;
  return div;
}

// ---- TYPING INDICATOR ----
export function showTyping() {
  logger.debug('Showing typing indicator.');
  const el = document.getElementById('messages');
  const w = document.getElementById('welcome');
  if (w) w.remove();

  const div = document.createElement('div');
  div.className = 'msg model';
  div.id = 'typing-indicator';
  div.innerHTML = `<div class="msg-role">◆ ADP-FC</div>
    <div class="typing-indicator">
      <div class="t-dot"></div><div class="t-dot"></div><div class="t-dot"></div>
    </div>`;
  el.appendChild(div);
  scrollBottom();
}

export function hideTyping() {
  logger.debug('Hiding typing indicator.');
  const el = document.getElementById('typing-indicator');
  if (el) el.remove();
}

// ---- HISTORY ----
export function renderHistory(chats, currentId, onSelect, onRename, onDelete) {
  logger.debug(`Rendering history for ${chats.length} chats.`);
  const el = document.getElementById('historyList');
  el.innerHTML = '';

  if (!chats || chats.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:11px;padding:8px 4px;font-family:var(--mono)">Нет чатов</div>';
    return;
  }

  chats.forEach(chat => {
    const div = document.createElement('div');
    div.className = 'history-item' + (chat.id === currentId ? ' active' : '');

    const d = new Date(chat.created);
    const dateStr = d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
      + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });

    div.innerHTML = `
      <div class="hi-content">
        <div class="hi-title">${escHtml(chat.title)}</div>
        <div class="hi-meta">${dateStr} · ${chat.messages.length} сообщ.</div>
      </div>
      <div class="hi-actions">
        <button class="hi-act-btn rename" title="Переименовать">✎</button>
        <button class="hi-act-btn del" title="Удалить">✕</button>
      </div>`;

    div.querySelector('.hi-content').onclick = () => onSelect(chat.id);
    div.querySelector('.rename').onclick = (e) => { e.stopPropagation(); onRename(chat.id, chat.title); };
    div.querySelector('.del').onclick = (e) => { e.stopPropagation(); onDelete(chat.id, chat.title); };

    el.appendChild(div);
  });
}

// ---- COMMANDS ----
export function renderCommands(defaultCmds, customCmds, artist, onCmd) {
  logger.debug(`Rendering ${defaultCmds.length + customCmds.length} commands.`);
  const grid = document.getElementById('cmdGrid');
  grid.innerHTML = '';

  const allCmds = [
    ...defaultCmds,
    ...customCmds.map(c => ({ ...c, isCustom: true }))
  ];

  allCmds.forEach(cmd => {
    const btn = document.createElement('button');
    btn.className = 'cmd-btn' + (cmd.isCustom ? ' custom-cmd' : '');
    btn.innerHTML = `<span class="cn">${escHtml(cmd.name)}</span><span class="cd">${escHtml(cmd.desc)}</span>`;
    btn.onclick = () => {
      const text = cmd.template.replace(/\{artist\}/g, artist || '');
      onCmd(text);
    };
    grid.appendChild(btn);
  });
}

// ---- BANNED TAGS ----
export function renderBannedTags(containerId, words, onRemove) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  words.forEach(word => {
    const tag = document.createElement('span');
    tag.className = 'banned-tag';
    tag.innerHTML = `${escHtml(word)} <button class="banned-tag-del" title="Удалить">✕</button>`;
    tag.querySelector('.banned-tag-del').onclick = () => onRemove(word);
    el.appendChild(tag);
  });
}

// ---- CUSTOM COMMANDS LIST ----
export function renderCustomCmdList(cmds, onDelete) {
  const el = document.getElementById('customCmdList');
  if (!el) return;
  el.innerHTML = '';
  if (cmds.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:12px;padding:4px;">Нет кастомных команд</div>';
    return;
  }
  cmds.forEach(cmd => {
    const div = document.createElement('div');
    div.className = 'custom-cmd-item';
    div.innerHTML = `
      <span class="cci-name">${escHtml(cmd.name)}</span>
      <span class="cci-template">${escHtml(cmd.template)}</span>
      <button class="cci-del" title="Удалить">✕</button>`;
    div.querySelector('.cci-del').onclick = () => onDelete(cmd.id);
    el.appendChild(div);
  });
}

// ---- SCROLL ----
export function scrollBottom() {
  const el = document.getElementById('messages');
  if (el) el.scrollTop = el.scrollHeight;
}

// ---- MODAL HELPERS ----
export function openModal(id) {
  logger.debug(`Opening modal: #${id}`);
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}
export function closeModal(id) {
  logger.debug(`Closing modal: #${id}`);
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

export function initTabs(modalEl) {
  const tabs = modalEl.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.onclick = () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const target = tab.dataset.tab;
      logger.debug(`Switching to tab "${target}" in modal.`);
      modalEl.querySelectorAll('.tab-content').forEach(tc => {
        const id = tc.id;
        // find suffix after last -
        const match = id.match(/Tab-(.+)$/);
        if (match) {
          tc.classList.toggle('hidden', match[1] !== target);
        }
      });
    };
  });
}

// ---- CONFIRM DIALOG ----
export function showConfirm(title, text) {
  logger.debug(`Showing confirm dialog: "${title}"`);
  return new Promise(resolve => {
    document.getElementById('confirmTitle').textContent = title;
    document.getElementById('confirmText').textContent = text;
    openModal('confirmModal');

    const ok = document.getElementById('confirmOkBtn');
    const cancel = document.getElementById('confirmCancelBtn');

    function cleanup(result) {
      closeModal('confirmModal');
      ok.onclick = null; cancel.onclick = null;
      logger.debug(`Confirm dialog resolved with: ${result}`);
      resolve(result);
    }
    ok.onclick = () => cleanup(true);
    cancel.onclick = () => cleanup(false);
  });
}

// ---- RENAME DIALOG ----
export function showRenameDialog(currentTitle) {
  logger.debug(`Showing rename dialog for: "${currentTitle}"`);
  return new Promise(resolve => {
    document.getElementById('renameInput').value = currentTitle;
    openModal('renameModal');

    const save = document.getElementById('renameSaveBtn');
    const cancel = document.getElementById('renameCancelBtn');
    const input = document.getElementById('renameInput');

    setTimeout(() => { input.focus(); input.select(); }, 50);

    function cleanup(result) {
      closeModal('renameModal');
      save.onclick = null; cancel.onclick = null;
      input.onkeydown = null;
      logger.debug(`Rename dialog resolved with: ${result}`);
      resolve(result);
    }
    save.onclick = () => cleanup(input.value.trim() || currentTitle);
    cancel.onclick = () => cleanup(null);
    input.onkeydown = (e) => {
      if (e.key === 'Enter') cleanup(input.value.trim() || currentTitle);
      if (e.key === 'Escape') cleanup(null);
    };
  });
}

// ---- DOWNLOAD ----
export function downloadText(filename, content) {
  logger.debug(`Downloading text file: ${filename}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
  a.download = filename;
  a.click();
}

export function downloadJson(filename, data) {
  logger.debug(`Downloading JSON file: ${filename}`);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  a.download = filename;
  a.click();
}

export function readJsonFile(file) {
  logger.debug(`Reading JSON file: ${file.name}`);
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => {
      try {
        const result = JSON.parse(e.target.result);
        logger.debug('Successfully parsed JSON file.');
        resolve(result);
      }
      catch(err) {
        logger.error('Failed to parse JSON file:', err);
        reject(new Error('Неверный JSON файл'));
      }
    };
    r.onerror = () => {
      logger.error('Failed to read file.');
      reject(new Error('Ошибка чтения файла'));
    };
    r.readAsText(file);
  });
}
