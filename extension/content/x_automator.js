// content/x_automator.js
(function() {
'use strict';

console.log("X Auto Bot: Automator loaded on X.com");

const MAX_LOGS = 50;
const POST_DELIVERY_MODE_X_SCHEDULE = 'xNativeSchedule';
let isAutomatorBusy = false;
let consecutiveFailures = 0;

function checkAndPause() {
  if (consecutiveFailures >= 2) {
    pauseAutomation(`连续 ${consecutiveFailures} 次操作失败，请检查当前页面状态后手动点击继续`);
  }
}

function pauseAutomation(reason) {
  addLog('error', reason);
  chrome.storage.local.set({
    isAutoPaused: true,
    pauseReason: reason
  });
  try {
    const result = chrome.runtime.sendMessage({ action: 'postFailed', reason });
    if (result?.catch) result.catch(() => {});
  } catch (e) {
    // Extension context may be gone during reload; local pause state is already written.
  }
}

function safeRuntimeMessage(message) {
  try {
    const result = chrome.runtime.sendMessage(message);
    if (result?.catch) result.catch(() => {});
  } catch (e) {
    // Extension context may be gone during reload.
  }
}

function notifyReplyFailed(reason) {
  safeRuntimeMessage({ action: 'replyFailed', reason });
}

function notifyReplyCompleted(tweetAuthor, tweetContent, replyText) {
  safeRuntimeMessage({
    action: 'replyCompleted',
    tweetAuthor,
    tweetContent,
    replyText
  });
}

function addLog(level, message) {
  if (!chrome.runtime?.id) return;
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'automator'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

function getIntentPostUrl(text) {
  return `https://x.com/intent/post?text=${encodeURIComponent(text || '')}`;
}

function normalizeText(text) {
  return (text || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\r/g, '')
    .split('\n')
    .map(line => line.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function getEditorText(element) {
  return normalizeText(element?.innerText || element?.textContent || element?.value || '');
}

function findTweetEditor(scope = document) {
  const root = scope || document;
  const selectors = [
    '[data-testid="tweetTextarea_0"] [contenteditable="true"]',
    '[data-testid="tweetTextarea_0"][contenteditable="true"]',
    '[role="textbox"][contenteditable="true"]'
  ];
  const candidates = [...new Set(selectors.flatMap(selector => Array.from(root.querySelectorAll(selector))))]
    .filter(element => element.isContentEditable && isVisibleElement(element));
  return candidates.find((element) => {
    const label = `${element.getAttribute('aria-label') || ''} ${element.closest('[data-testid="tweetTextarea_0"]') ? 'tweetTextarea' : ''}`;
    return /tweet|post|reply|回复|发帖|发布|tweetTextarea/i.test(label);
  }) || candidates[0] || null;
}

function findActiveDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  return dialogs.find(dialog => findTweetEditor(dialog)) || dialogs[0] || null;
}

function findSendButton(scope) {
  const root = scope || document;
  return root.querySelector('[data-testid="tweetButton"]') || root.querySelector('[data-testid="tweetButtonInline"]');
}

function isVisibleElement(element) {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function findButtonByText(scope, patterns = []) {
  const root = scope || document;
  return Array.from(root.querySelectorAll('button, [role="button"]'))
    .filter(isVisibleElement)
    .find((button) => {
      const text = `${button.innerText || ''} ${button.getAttribute('aria-label') || ''} ${button.getAttribute('title') || ''}`;
      return patterns.some(pattern => pattern.test(text));
    });
}

function findScheduleButton(scope = document) {
  const root = scope || document;
  return root.querySelector('[data-testid="scheduleOption"]')
    || root.querySelector('button[aria-label*="Schedule"]')
    || root.querySelector('button[aria-label*="定时"]')
    || root.querySelector('button[aria-label*="安排"]')
    || findButtonByText(root, [/schedule/i, /定时|安排|日程/]);
}

function findDraftsButton(scope = document) {
  const root = scope || document;
  return root.querySelector('[data-testid="draftsButton"]')
    || root.querySelector('a[href*="draft"]')
    || root.querySelector('button[aria-label*="Draft"]')
    || root.querySelector('button[aria-label*="草稿"]')
    || findButtonByText(root, [/drafts?/i, /草稿/]);
}

function findComposeButton(scope = document) {
  const root = scope || document;
  return root.querySelector('a[data-testid="SideNav_NewTweet_Button"]')
    || root.querySelector('a[href="/compose/post"]')
    || root.querySelector('[data-testid="FloatingActionButtons_Tweet_Button"]')
    || findButtonByText(root, [/^post$/i, /^tweet$/i, /发帖|发布/]);
}

function parseDraftCountFromText(text = '') {
  const patterns = [
    /Drafts?\s*\(?\s*(\d+)\s*\)?/i,
    /(\d+)\s+Drafts?/i,
    /草稿\s*\(?\s*(\d+)\s*\)?/,
    /(\d+)\s*个?草稿/
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return Number(match[1]);
  }
  return null;
}

function countDraftRows(scope = document) {
  const textCount = parseDraftCountFromText(scope.innerText || '');
  if (Number.isFinite(textCount)) return textCount;

  const rows = Array.from(scope.querySelectorAll('[data-testid="cellInnerDiv"], [role="listitem"], article, div[role="button"]'))
    .filter(isVisibleElement)
    .filter((row) => {
      const text = (row.innerText || '').trim();
      if (text.length < 4) return false;
      if (/Drafts?|草稿|Close|关闭|Back|返回|Done|完成/i.test(text) && text.length < 18) return false;
      if (/Post|Tweet|发布|发帖|Schedule|定时/i.test(text) && text.length < 18) return false;
      return true;
    });
  return rows.length;
}

async function closeTopDialogIfSafe() {
  const dialog = findActiveDialog();
  if (!dialog) return;
  const editor = findTweetEditor(dialog);
  if (editor && getEditorText(editor)) return;
  const closeButton = dialog.querySelector('[data-testid="app-bar-close"]')
    || dialog.querySelector('button[aria-label*="Close"]')
    || dialog.querySelector('button[aria-label*="关闭"]')
    || dialog.querySelector('button[aria-label*="Back"]')
    || dialog.querySelector('button[aria-label*="返回"]');
  if (closeButton) {
    simulateRealClick(closeButton);
    await sleep(500);
  }
}

function getButtonDisabledReason(button) {
  if (!button) return 'button-not-found';
  return [
    button.disabled ? 'disabled=true' : '',
    button.getAttribute('aria-disabled') ? `aria-disabled=${button.getAttribute('aria-disabled')}` : '',
    button.getAttribute('disabled') !== null ? 'disabled-attr' : ''
  ].filter(Boolean).join(', ') || 'unknown';
}

async function waitForElement(getter, timeout = 8000, interval = 250) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const element = typeof getter === 'function' ? getter() : document.querySelector(getter);
    if (element) return element;
    await sleep(interval);
  }
  return null;
}

async function waitForEnabledButton(getter, timeout = 10000, interval = 500) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const button = getter();
    if (button && !button.disabled && button.getAttribute('aria-disabled') !== 'true') {
      return button;
    }
    await sleep(interval);
  }
  return null;
}

function isLoggedOutOrBlocked() {
  const bodyText = document.body?.innerText || '';
  return (
    document.querySelector('a[href="/login"], a[href="/i/flow/login"]') ||
    /Sign in to X|Log in to X|登录 X|登录到 X|Something went wrong|出错了|验证码|Verify your identity|Confirm your identity|验证你的身份|需要验证|captcha/i.test(bodyText)
  );
}

window.addEventListener('xAutoBot_ReadyToReply', async (e) => {
  if (isAutomatorBusy) {
    addLog('warn', '上一次回复/发推操作尚未完成，跳过本次回复触发');
    return;
  }
  if (!chrome.runtime?.id) return;
  const { tweetElementId, replyText, tweetAuthor, tweetContent } = e.detail;
  const author = tweetAuthor || '未知用户';
  const originalText = tweetContent || '';
  
  chrome.storage.local.get(['isRunning'], async (result) => {
    if (!result.isRunning) return;

    isAutomatorBusy = true;
    const tweetNode = document.querySelector(`article[data-bot-id="${tweetElementId}"]`);
    if (!tweetNode) {
      const reason = `未找到 @${author} 的目标推文节点，取消回复`;
      addLog('warn', reason);
      notifyReplyFailed(reason);
      isAutomatorBusy = false;
      return;
    }

    addLog('info', `开始回复 @${author}...`);
    chrome.storage.local.set({ isTyping: true });
    try {
      // 1. Click the Reply button
      const replyBtn = tweetNode.querySelector('[data-testid="reply"]');
      if (!replyBtn) {
        const reason = `未找到 @${author} 推文的回复按钮`;
        addLog('warn', reason);
        notifyReplyFailed(reason);
        return;
      }
      replyBtn.click();
      addLog('info', '已点击回复按钮');
      
      // Wait for the modal dialog / input field to appear
      await sleep(1500); 

      // 2. Find the input field inside the modal
      const dialog = await waitForElement(findActiveDialog, 6000);
      const draftEditor = dialog ? findTweetEditor(dialog) : findTweetEditor(document);
      if (!draftEditor) {
        const reason = '未找到回复输入框';
        addLog('warn', reason);
        notifyReplyFailed(reason);
        return;
      }
      addLog('info', '已定位到输入框，准备模拟输入');

      // 3. Simulate typing
      await simulateTyping(draftEditor, replyText);
      addLog('info', `已输入回复内容 (${replyText.length} 字)`);
      if (getEditorText(draftEditor) !== normalizeText(replyText)) {
        consecutiveFailures++;
        const reason = `回复文本校验失败，取消发送 (连续失败 ${consecutiveFailures} 次)`;
        addLog('error', reason);
        notifyReplyFailed(reason);
        checkAndPause();
        return;
      }

      // 4. Find send button INSIDE the dialog (not globally)
      let sendBtn = null;
      
      if (dialog) {
        sendBtn = dialog.querySelector('[data-testid="tweetButton"]') || dialog.querySelector('[data-testid="tweetButtonInline"]');
        addLog('info', `在弹窗内查找发送按钮: ${sendBtn ? '找到' : '未找到'}`);
      }
      
      // fallback to global search if not found in dialog
      if (!sendBtn) {
        sendBtn = document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]');
        addLog('warn', '弹窗内未找到按钮，尝试全局查找');
      }
      
      if (!sendBtn) {
        addLog('warn', '第1次尝试：未找到发送按钮，等待重试...');
        await sleep(1500);
        const retryDialog = document.querySelector('div[role="dialog"]');
        sendBtn = retryDialog 
          ? (retryDialog.querySelector('[data-testid="tweetButton"]') || retryDialog.querySelector('[data-testid="tweetButtonInline"]'))
          : (document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]'));
      }
      
      if (sendBtn) {
        addLog('info', `找到发送按钮，当前 disabled=${sendBtn.disabled}, aria-disabled=${sendBtn.getAttribute('aria-disabled')}`);
        
        sendBtn = await waitForEnabledButton(() => {
          const d = findActiveDialog();
          return d ? findSendButton(d) : findSendButton(document);
        }, 6000);
        if (!sendBtn && getEditorText(draftEditor) === normalizeText(replyText)) {
          addLog('warn', '回复按钮仍未启用，尝试重新同步输入状态');
          await nudgeEditorState(draftEditor);
          sendBtn = await waitForEnabledButton(() => {
            const d = findActiveDialog();
            return d ? findSendButton(d) : findSendButton(document);
          }, 9000);
        }
        
        if (!sendBtn) {
          consecutiveFailures++;
          const currentButton = dialog ? findSendButton(dialog) : findSendButton(document);
          const reason = `发送按钮未自然启用，取消本次回复。文本长度 ${normalizeText(replyText).length}，输入框文本「${getEditorText(draftEditor).substring(0, 40)}」，按钮状态 ${getButtonDisabledReason(currentButton)} (连续失败 ${consecutiveFailures} 次)`;
          addLog('error', reason);
          notifyReplyFailed(reason);
          checkAndPause();
          return;
        } else {
          simulateRealClick(sendBtn);
          addLog('info', '已触发发送按钮点击事件');
          await sleep(1500);
        }
        
        // 最终判断
        const modalGone = !(document.querySelector('div[role="dialog"]') || document.querySelector('div[data-testid="tweetTextarea_0"]'));
        const shortOriginal = originalText.substring(0, 50) + (originalText.length > 50 ? '...' : '');
        const shortReply = replyText.substring(0, 80) + (replyText.length > 80 ? '...' : '');
        
        if (modalGone) {
          consecutiveFailures = 0;
          addLog('success', `✅ 已回复 @${author} | 原文：「${shortOriginal}」→ 回复：「${shortReply}」`);
          notifyReplyCompleted(author, originalText, replyText);
        } else {
          consecutiveFailures++;
          const reason = `弹窗仍在，可能发送失败，请手动检查 @${author} 的回复 (连续失败 ${consecutiveFailures} 次)`;
          addLog('warn', `⚠️ ${reason}`);
          notifyReplyFailed(reason);
          checkAndPause();
        }
      } else {
        consecutiveFailures++;
        const reason = `未找到发送按钮，回复未完成 (连续失败 ${consecutiveFailures} 次)`;
        addLog('error', reason);
        notifyReplyFailed(reason);
        checkAndPause();
      }
      
    } catch (error) {
      consecutiveFailures++;
      const reason = `自动回复异常: ${error.message} (连续失败 ${consecutiveFailures} 次)`;
      addLog('error', reason);
      notifyReplyFailed(reason);
      checkAndPause();
    } finally {
      chrome.storage.local.set({ isTyping: false });
      isAutomatorBusy = false;
    }
  });
});

async function simulateTyping(element, text) {
  const normalized = normalizeText(text);
  const methods = [
    insertByKeyboardEvents,
    insertByExecCommand,
    insertByPasteEvent,
    insertByDirectInput
  ];

  for (const method of methods) {
    try {
      await method(element, normalized);
      await sleep(650);
      if (getEditorText(element) === normalized) {
        await nudgeEditorState(element);
        await sleep(1200);
        return;
      }
    } catch (error) {
      addLog('warn', `输入方法失败，尝试下一种: ${error.message}`);
    }
  }

  await sleep(1200);
}

function setEditorSelection(element, selectAll = false) {
  if (!element) return;
  element.focus();
  if (!element.isContentEditable) {
    if (selectAll) {
      element.setSelectionRange?.(0, element.value?.length || 0);
    }
    return;
  }
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(element);
  if (!selectAll) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

async function prepareEditor(element) {
  element.focus();
  element.click();
  await sleep(120);
  setEditorSelection(element, true);
  try {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
  } catch (e) {
    // Some pages block execCommand; fallback methods below still run.
  }
  if (element.isContentEditable && getEditorText(element)) {
    element.textContent = '';
  } else if (!element.isContentEditable) {
    element.value = '';
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
  setEditorSelection(element, false);
}

async function insertByKeyboardEvents(element, text) {
  await prepareEditor(element);
  for (const char of Array.from(text)) {
    const keyEventInit = {
      bubbles: true,
      cancelable: true,
      key: char,
      code: char === '\n' ? 'Enter' : undefined
    };
    element.dispatchEvent(new KeyboardEvent('keydown', keyEventInit));
    element.dispatchEvent(new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: char === '\n' ? 'insertLineBreak' : 'insertText',
      data: char === '\n' ? null : char
    }));
    document.execCommand('insertText', false, char);
    element.dispatchEvent(new InputEvent('input', {
      bubbles: true,
      inputType: char === '\n' ? 'insertLineBreak' : 'insertText',
      data: char === '\n' ? null : char
    }));
    element.dispatchEvent(new KeyboardEvent('keyup', keyEventInit));
    await sleep(8);
  }
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByExecCommand(element, text) {
  await prepareEditor(element);
  setEditorSelection(element, false);
  document.execCommand('insertText', false, text);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByPasteEvent(element, text) {
  await prepareEditor(element);
  setEditorSelection(element, false);
  const data = new DataTransfer();
  data.setData('text/plain', text);
  const pasteEvent = new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: data
  });
  element.dispatchEvent(pasteEvent);
  if (getEditorText(element) !== text) {
    document.execCommand('insertText', false, text);
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertFromPaste', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByDirectInput(element, text) {
  await prepareEditor(element);
  if (element.isContentEditable) {
    element.textContent = text;
  } else {
    element.value = text;
  }
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function nudgeEditorState(element) {
  if (!element || !element.isContentEditable) return;
  setEditorSelection(element, false);
  const before = getEditorText(element);
  try {
    document.execCommand('insertText', false, ' ');
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ' ' }));
    document.execCommand('delete', false, null);
    element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
  } catch (e) {
    // Best-effort nudge only.
  }
  if (getEditorText(element) !== before) {
    await insertByExecCommand(element, before);
  }
}

function simulateRealClick(element) {
  const rect = element.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  
  const eventInit = { 
    bubbles: true, 
    cancelable: true, 
    view: window,
    clientX: x,
    clientY: y
  };
  
  element.dispatchEvent(new PointerEvent('pointerdown', eventInit));
  element.dispatchEvent(new MouseEvent('mousedown', eventInit));
  element.dispatchEvent(new PointerEvent('pointerup', eventInit));
  element.dispatchEvent(new MouseEvent('mouseup', eventInit));
  element.dispatchEvent(new MouseEvent('click', eventInit));
}

function dispatchFormEvents(element) {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

function selectOptionByCandidates(select, candidates = []) {
  const normalized = candidates.map(value => String(value).toLowerCase());
  const option = Array.from(select.options || []).find((item) => {
    const text = String(item.textContent || '').trim().toLowerCase();
    const value = String(item.value || '').trim().toLowerCase();
    return normalized.some(candidate => text === candidate || value === candidate || text.includes(candidate));
  });
  if (!option) return false;
  select.value = option.value;
  dispatchFormEvents(select);
  return true;
}

function classifyScheduleSelect(select) {
  const label = `${select.getAttribute('aria-label') || ''} ${select.name || ''} ${select.id || ''}`.toLowerCase();
  const optionsText = Array.from(select.options || []).map(option => option.textContent || option.value || '').join(' ').toLowerCase();
  if (/month|月|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/.test(label + optionsText)) return 'month';
  if (/year|年/.test(label) || /\b20\d{2}\b/.test(optionsText)) return 'year';
  if (/day|日|号/.test(label)) return 'day';
  if (/hour|时|点/.test(label)) return 'hour';
  if (/minute|分/.test(label)) return 'minute';
  if (/am|pm|上午|下午/.test(label + optionsText)) return 'ampm';
  return '';
}

function fillNativeSelectSchedule(dialog, scheduledAt) {
  const selects = Array.from(dialog.querySelectorAll('select')).filter(isVisibleElement);
  if (selects.length < 3) return false;

  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const shortMonthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const month = scheduledAt.getMonth() + 1;
  const day = scheduledAt.getDate();
  const year = scheduledAt.getFullYear();
  const hour24 = scheduledAt.getHours();
  const hour12 = hour24 % 12 || 12;
  const minute = scheduledAt.getMinutes();
  const ampm = hour24 >= 12 ? 'PM' : 'AM';
  const used = new Set();

  const setByType = (type, candidates) => {
    const select = selects.find(item => !used.has(item) && classifyScheduleSelect(item) === type);
    if (!select) return false;
    const ok = selectOptionByCandidates(select, candidates);
    if (ok) used.add(select);
    return ok;
  };

  setByType('month', [month, String(month), String(month).padStart(2, '0'), monthNames[month - 1], shortMonthNames[month - 1], `${month}月`]);
  setByType('day', [day, String(day), String(day).padStart(2, '0')]);
  setByType('year', [year, String(year)]);
  setByType('hour', [hour12, hour24, String(hour12), String(hour24).padStart(2, '0')]);
  setByType('minute', [minute, String(minute).padStart(2, '0'), String(minute)]);
  setByType('ampm', [ampm, ampm.toLowerCase(), ampm === 'AM' ? '上午' : '下午']);

  const remaining = selects.filter(item => !used.has(item));
  const fallbackValues = [
    [month, String(month), String(month).padStart(2, '0'), monthNames[month - 1], shortMonthNames[month - 1], `${month}月`],
    [day, String(day), String(day).padStart(2, '0')],
    [year, String(year)],
    [hour12, hour24, String(hour12), String(hour24).padStart(2, '0')],
    [minute, String(minute).padStart(2, '0'), String(minute)],
    [ampm, ampm.toLowerCase(), ampm === 'AM' ? '上午' : '下午']
  ];
  remaining.forEach((select, index) => {
    selectOptionByCandidates(select, fallbackValues[index] || []);
  });

  return true;
}

function fillNativeInputSchedule(dialog, scheduledAt) {
  const inputs = Array.from(dialog.querySelectorAll('input')).filter(isVisibleElement);
  if (inputs.length === 0) return false;
  const dateValue = scheduledAt.toISOString().slice(0, 10);
  const timeValue = `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`;
  let touched = false;

  inputs.forEach((input) => {
    const label = `${input.type || ''} ${input.getAttribute('aria-label') || ''} ${input.name || ''} ${input.placeholder || ''}`.toLowerCase();
    if (/date|日期/.test(label)) {
      input.value = dateValue;
      dispatchFormEvents(input);
      touched = true;
    } else if (/time|时间|hour|minute|小时|分钟/.test(label)) {
      input.value = timeValue;
      dispatchFormEvents(input);
      touched = true;
    }
  });
  return touched;
}

async function applyNativeSchedule(scheduledAt) {
  const scheduleDate = new Date(Number(scheduledAt));
  if (!Number.isFinite(scheduleDate.getTime())) {
    pauseAutomation('X 定时发布时间无效，已暂停');
    return false;
  }

  const scheduleBtn = await waitForElement(() => findScheduleButton(document), 8000);
  if (!scheduleBtn) {
    pauseAutomation('未找到 X 定时发布按钮，无法写入原生定时发布');
    return false;
  }
  simulateRealClick(scheduleBtn);
  addLog('info', '已打开 X 定时发布面板');
  await sleep(1200);

  const scheduleDialog = await waitForElement(() => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
    return dialogs.find(dialog => /schedule|定时|安排|日程|date|time|日期|时间/i.test(dialog.innerText || ''));
  }, 8000);
  if (!scheduleDialog) {
    pauseAutomation('未找到 X 定时发布弹窗，已暂停');
    return false;
  }

  const selected = fillNativeSelectSchedule(scheduleDialog, scheduleDate) || fillNativeInputSchedule(scheduleDialog, scheduleDate);
  if (!selected) {
    pauseAutomation('无法识别 X 定时发布日期/时间控件，已暂停');
    return false;
  }
  addLog('info', `已填写 X 定时发布时间：${scheduleDate.toLocaleString()}`);
  await sleep(500);

  const confirmBtn = findButtonByText(scheduleDialog, [/confirm/i, /done/i, /schedule/i, /确认|完成|设定|安排|定时/]);
  if (!confirmBtn) {
    pauseAutomation('未找到 X 定时发布时间确认按钮，已暂停');
    return false;
  }
  simulateRealClick(confirmBtn);
  addLog('info', '已确认 X 定时发布时间');
  await sleep(1500);
  return true;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "postNewTweet") {
    addLog('info', '收到后台发推指令');
    handlePendingPost();
    sendResponse({ success: true });
  } else if (request.action === "readXOfficialDraftCount") {
    readXOfficialDraftCount()
      .then(count => sendResponse({ success: true, count }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

// Run once on load in case the tab was newly opened by background
setTimeout(handlePendingPost, 3000);

async function handlePendingPost() {
  if (isAutomatorBusy) {
    addLog('warn', '上一次回复/发推操作尚未完成，跳过本次发推触发');
    return;
  }
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'pendingScheduledAt', 'isRunning'], async (result) => {
    const isManualTest = result.pendingPostSource === 'manualTest';
    const isNativeSchedule = result.pendingPostSource === POST_DELIVERY_MODE_X_SCHEDULE;
    if (!result.isRunning && !isManualTest) {
      addLog('info', '机器人已停止，跳过发推');
      return;
    }
    if (!result.pendingPost) {
      return;
    }
    
    isAutomatorBusy = true;
    const postText = String(result.pendingPost || '').trim();
    const expectedText = normalizeText(postText);
    
    addLog('info', isManualTest ? '开始执行测试发文...' : (isNativeSchedule ? '开始写入 X 原生定时发布...' : '开始执行定时发文...'));
    chrome.storage.local.set({ isTyping: true });
    try {
      if (!postText) {
        pauseAutomation('待发推文为空，已暂停');
        return;
      }

      if (isLoggedOutOrBlocked()) {
        pauseAutomation('X 页面可能未登录、报错或出现验证，已暂停发推');
        return;
      }

      if (!window.location.pathname.includes('/intent/post')) {
        addLog('info', '使用 X intent/post 预填推文，避免中文输入法污染');
        window.location.assign(getIntentPostUrl(postText));
        return;
      }

      const draftEditor = await waitForElement(findTweetEditor, 10000);
      if (!draftEditor) {
        pauseAutomation('未找到 intent/post 推文编辑器，已暂停');
        return;
      }

      let actualText = getEditorText(draftEditor);
      if (actualText !== expectedText) {
        addLog('warn', `预填文本暂未匹配，等待 X 渲染。当前: ${actualText.substring(0, 40)}...`);
        await sleep(1200);
        actualText = getEditorText(draftEditor);
      }

      if (actualText !== expectedText) {
        pauseAutomation(`预填文本校验失败，已暂停。期望「${expectedText.substring(0, 40)}...」，实际「${actualText.substring(0, 40)}...」`);
        return;
      }

      addLog('success', `推文文本校验通过 (${postText.length} 字)`);

      if (isNativeSchedule) {
        const scheduled = await applyNativeSchedule(result.pendingScheduledAt);
        if (!scheduled) return;
      }

      const postDialog = draftEditor.closest('div[role="dialog"]') || document.querySelector('div[role="dialog"]');
      let sendBtn = postDialog ? findSendButton(postDialog) : findSendButton(document);
      if (!sendBtn) {
        sendBtn = await waitForElement(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          return dialog ? findSendButton(dialog) : findSendButton(document);
        }, 5000);
      }

      if (!sendBtn) {
        consecutiveFailures++;
        addLog('error', `未找到发推按钮 (连续失败 ${consecutiveFailures} 次)`);
        checkAndPause();
        return;
      }

      sendBtn = await waitForEnabledButton(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        return dialog ? findSendButton(dialog) : findSendButton(document);
      }, 10000);

      if (!sendBtn) {
        consecutiveFailures++;
        addLog('error', `发推按钮未自然启用，取消发推 (连续失败 ${consecutiveFailures} 次)`);
        checkAndPause();
        return;
      }

      simulateRealClick(sendBtn);
      addLog('info', '已点击发推按钮');
      await waitForElement(() => {
        const editorStillOpen = document.querySelector('div[role="dialog"]') || findTweetEditor();
        return editorStillOpen ? null : document.body;
      }, 10000, 500);

      const editorStillOpen = document.querySelector('div[role="dialog"]') || findTweetEditor();
      if (editorStillOpen) {
        consecutiveFailures++;
        addLog('warn', `发帖框仍在，发推可能未完成 (连续失败 ${consecutiveFailures} 次)`);
        checkAndPause();
        return;
      }

      consecutiveFailures = 0;
      addLog('success', isManualTest ? '测试推文发送成功！' : (isNativeSchedule ? 'X 原生定时发布创建成功！' : '定时推文发送成功！'));
      chrome.runtime.sendMessage({
        action: 'postCompleted',
        source: result.pendingPostSource || 'queue'
      }, () => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource', 'pendingScheduledAt']);
        }
      });
      
    } catch (e) {
      consecutiveFailures++;
      addLog('error', `定时发文异常: ${e.message} (连续失败 ${consecutiveFailures} 次)`);
      checkAndPause();
    } finally {
      chrome.storage.local.set({ isTyping: false });
      isAutomatorBusy = false;
    }
  });
}

async function readXOfficialDraftCount() {
  if (isAutomatorBusy) throw new Error('Agent 正在执行发布/回复，稍后再读取 X 草稿');
  if (isLoggedOutOrBlocked()) throw new Error('X 页面未登录或正在验证，无法读取官方草稿');

  isAutomatorBusy = true;
  chrome.storage.local.set({
    xOfficialDraftStatus: 'reading',
    xOfficialDraftError: ''
  });

  try {
    const existingDraftButton = findDraftsButton(document);
    if (!existingDraftButton) {
      const composeBtn = findComposeButton(document);
      if (composeBtn) {
        simulateRealClick(composeBtn);
      } else {
        window.location.assign('https://x.com/compose/post');
      }
      await sleep(1800);
    }

    const dialog = await waitForElement(findActiveDialog, 8000);
    const draftButton = findDraftsButton(dialog || document);
    if (!draftButton) {
      await closeTopDialogIfSafe();
      chrome.storage.local.set({
        xOfficialDraftCount: 0,
        xOfficialDraftStatus: 'success',
        xOfficialDraftError: '',
        xOfficialDraftReadAt: Date.now()
      });
      addLog('info', '未发现 X Drafts 入口，按 0 个官方草稿处理');
      return 0;
    }

    const buttonCount = parseDraftCountFromText(`${draftButton.innerText || ''} ${draftButton.getAttribute('aria-label') || ''}`);
    simulateRealClick(draftButton);
    await sleep(1500);

    const draftDialog = await waitForElement(() => {
      const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
      return dialogs.find(item => /Drafts?|草稿/i.test(item.innerText || '')) || dialogs[0];
    }, 8000);

    const count = Number.isFinite(buttonCount) ? buttonCount : countDraftRows(draftDialog || document);
    chrome.storage.local.set({
      xOfficialDraftCount: count,
      xOfficialDraftStatus: 'success',
      xOfficialDraftError: '',
      xOfficialDraftReadAt: Date.now()
    });
    addLog('success', `已读取 X 官方草稿数量：${count}`);
    await closeTopDialogIfSafe();
    return count;
  } catch (error) {
    chrome.storage.local.set({
      xOfficialDraftStatus: 'failed',
      xOfficialDraftError: error.message,
      xOfficialDraftReadAt: Date.now()
    });
    addLog('error', `读取 X 官方草稿失败: ${error.message}`);
    throw error;
  } finally {
    isAutomatorBusy = false;
  }
}

})();
