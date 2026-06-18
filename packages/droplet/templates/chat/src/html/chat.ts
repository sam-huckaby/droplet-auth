import type { AppConfig } from "../env";
import { escapeHtml, htmlPage } from "./layout";

export function chatPage(config: AppConfig, identity: { name: string | null }, selectedMessageId?: string): Response {
  return htmlPage(
    config.roomName,
    `<header>
  <div>
    <h1>${escapeHtml(config.roomName)}</h1>
    <p>${escapeHtml(config.roomDescription ?? "A project chat room for humans and agents.")}</p>
  </div>
  <p class="status" id="connection-status">Connecting...</p>
</header>
<section class="chat-shell">
  <div id="messages" class="messages" aria-live="polite"></div>
  <aside id="thread-panel" class="thread-panel" aria-hidden="true">
    <div>
      <button class="secondary" id="close-thread" type="button">Close thread</button>
      <p class="status" id="thread-title">No thread selected</p>
    </div>
    <div id="thread-list" class="thread-list"></div>
    <form id="reply-form" class="composer">
      <textarea name="body" placeholder="Reply in thread" required></textarea>
      <input type="file" name="file">
      <button type="submit">Send reply</button>
    </form>
  </aside>
</section>
<form id="message-form" class="composer">
  <textarea name="body" placeholder="Type a message" required></textarea>
  <div class="composer-row">
    <input id="display-name" name="authorName" placeholder="Display name" value="${escapeHtml(identity.name ?? "")}" ${identity.name ? "readonly" : ""} required>
    <input type="file" name="file">
    <button type="submit">Send</button>
  </div>
</form>
<script>window.__DROPLET_CHAT_INITIAL_THREAD__ = ${JSON.stringify(selectedMessageId ?? null)};${clientScript()}</script>`,
  );
}

function clientScript(): string {
  return `
const state = { selectedMessageId: window.__DROPLET_CHAT_INITIAL_THREAD__ || null, clientId: localStorage.getItem('droplet-chat-client-id') || crypto.randomUUID() };
localStorage.setItem('droplet-chat-client-id', state.clientId);
const messagesEl = document.getElementById('messages');
const statusEl = document.getElementById('connection-status');
const displayNameEl = document.getElementById('display-name');
const threadPanel = document.getElementById('thread-panel');
const threadList = document.getElementById('thread-list');
const threadTitle = document.getElementById('thread-title');
const messageForm = document.getElementById('message-form');
const replyForm = document.getElementById('reply-form');
if (!displayNameEl.value) displayNameEl.value = localStorage.getItem('droplet-chat-display-name') || '';

function escapeHtml(value) { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;'); }
function authorId() { return 'local-' + state.clientId; }
function authorName() { const name = displayNameEl.value.trim() || 'Anonymous'; localStorage.setItem('droplet-chat-display-name', name); return name; }
function textInput(form, name) { const field = form.elements.namedItem(name); return field && 'value' in field ? field.value : ''; }
function fileInput(form) { return form.querySelector('input[type=file]'); }
function submitOnEnter(textarea, form) { textarea.addEventListener('keydown', (event) => { if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return; event.preventDefault(); if (form.requestSubmit) form.requestSubmit(); else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); }); }
function isNearBottom(element) { return element.scrollHeight - element.scrollTop - element.clientHeight < 50; }
function scrollToBottom(element) { element.scrollTop = element.scrollHeight; }
function renderBody(value) { return escapeHtml(value).replaceAll('\\n', '<br>'); }
function attachmentLinks(attachments) { return (attachments || []).length ? '<p class="status">Attachments: ' + attachments.map(file => '<a href="/api/attachments/' + encodeURIComponent(file.id) + '/download">' + escapeHtml(file.filename || file.id) + '</a>').join(', ') + '</p>' : ''; }
function bubbleClass(entity, base) { return base + ' ' + base + '-' + (entity.authorType === 'human' ? 'human' : 'remote'); }
function messageHtml(message) { return '<article class="' + bubbleClass(message, 'message') + '" data-message-id="' + escapeHtml(message.id) + '"><div class="meta"><strong>' + escapeHtml(message.authorName) + '</strong><span>' + new Date(message.createdAt).toLocaleString() + '</span></div><div class="body">' + renderBody(message.body) + '</div>' + attachmentLinks(message.attachments) + '<p><button class="secondary" data-open-thread="' + escapeHtml(message.id) + '" type="button">Open thread (' + (message.replyCount || 0) + ')</button></p></article>'; }
function replyHtml(reply) { return '<article class="' + bubbleClass(reply, 'reply') + '"><div class="meta"><strong>' + escapeHtml(reply.authorName) + '</strong><span>' + new Date(reply.createdAt).toLocaleString() + '</span></div><div class="body">' + renderBody(reply.body) + '</div>' + attachmentLinks(reply.attachments) + '</article>'; }
async function loadMessages(options = {}) { const shouldScroll = options.forceScroll || isNearBottom(messagesEl); const response = await fetch('/api/messages'); const body = await response.json(); messagesEl.innerHTML = (body.messages || []).map(messageHtml).join('') || '<p class="status">No messages yet.</p>'; if (shouldScroll) scrollToBottom(messagesEl); }
async function loadThread(messageId, options = {}) { const shouldScroll = options.forceScroll || isNearBottom(threadList); const response = await fetch('/api/messages/' + encodeURIComponent(messageId) + '/replies'); const body = await response.json(); threadList.innerHTML = (body.replies || []).map(replyHtml).join('') || '<p class="status">No replies yet.</p>'; if (shouldScroll) scrollToBottom(threadList); }
async function uploadFile(form, target, name) { const input = fileInput(form); const file = input && input.files ? input.files[0] : null; if (!file) return; const data = new FormData(); data.set('file', file); data.set('authorId', authorId()); data.set('authorName', name); if (target.messageId) data.set('messageId', target.messageId); if (target.replyId) data.set('replyId', target.replyId); await fetch('/api/attachments', { method: 'POST', body: data }); }
messageForm.addEventListener('submit', async (event) => { event.preventDefault(); const form = event.currentTarget; const body = textInput(form, 'body').trim(); if (!body) return; const name = authorName(); const response = await fetch('/api/messages', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, authorId: authorId(), authorName: name }) }); const json = await response.json(); if (json.ok) { await uploadFile(form, { messageId: json.message.id }, name); form.reset(); displayNameEl.value = name; await loadMessages({ forceScroll: true }); } else alert(json.error.message); });
replyForm.addEventListener('submit', async (event) => { event.preventDefault(); if (!state.selectedMessageId) return; const form = event.currentTarget; const body = textInput(form, 'body').trim(); if (!body) return; const name = authorName(); const response = await fetch('/api/messages/' + encodeURIComponent(state.selectedMessageId) + '/replies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ body, authorId: authorId(), authorName: name }) }); const json = await response.json(); if (json.ok) { await uploadFile(form, { replyId: json.reply.id }, name); form.reset(); displayNameEl.value = name; await loadThread(state.selectedMessageId, { forceScroll: true }); } else alert(json.error.message); });
submitOnEnter(messageForm.elements.namedItem('body'), messageForm);
submitOnEnter(replyForm.elements.namedItem('body'), replyForm);
function openThreadPanel() { threadPanel.classList.add('thread-open'); threadPanel.setAttribute('aria-hidden', 'false'); }
function closeThreadPanel() { threadPanel.classList.remove('thread-open'); threadPanel.setAttribute('aria-hidden', 'true'); }
messagesEl.addEventListener('click', async (event) => { const button = event.target.closest('[data-open-thread]'); if (!button) return; state.selectedMessageId = button.dataset.openThread; openThreadPanel(); threadTitle.textContent = 'Thread ' + state.selectedMessageId; await loadThread(state.selectedMessageId, { forceScroll: true }); });
document.getElementById('close-thread').addEventListener('click', () => { state.selectedMessageId = null; closeThreadPanel(); });
function connect() { const ws = new WebSocket(location.origin.replace(/^http/, 'ws') + '/ws'); ws.addEventListener('open', () => { statusEl.textContent = 'Live'; }); ws.addEventListener('close', () => { statusEl.textContent = 'Disconnected. Reconnecting...'; setTimeout(connect, 1000); }); ws.addEventListener('message', async (event) => { try { const item = JSON.parse(event.data); if (item.type === 'message.created' || item.type === 'attachment.created') await loadMessages(); if (item.type === 'reply.created' && state.selectedMessageId === item.payload.parentMessageId) await loadThread(state.selectedMessageId); } catch {} }); }
loadMessages({ forceScroll: true }).then(async () => { if (state.selectedMessageId) { openThreadPanel(); threadTitle.textContent = 'Thread ' + state.selectedMessageId; await loadThread(state.selectedMessageId, { forceScroll: true }); } }).catch(() => { messagesEl.innerHTML = '<p class="status">Unable to load messages.</p>'; });
connect();
`;
}
