// content/x_automator.js
(function() {
'use strict';

console.log("X Auto Bot: Automator loaded on X.com");

const MAX_LOGS = 50;
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
  return root.querySelector('[data-testid="tweetTextarea_0"][role="textbox"][contenteditable="true"]')
    || root.querySelector('[data-testid="tweetTextarea_0"] [role="textbox"][contenteditable="true"]')
    || root.querySelector('[role="textbox"][contenteditable="true"][aria-label]')
    || root.querySelector('div[data-testid="tweetTextarea_0"]');
}

function findActiveDialog() {
  const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
  return dialogs.find(dialog => findTweetEditor(dialog)) || dialogs[0] || null;
}

function findSendButton(scope) {
  const root = scope || document;
  return root.querySelector('[data-testid="tweetButton"]') || root.querySelector('[data-testid="tweetButtonInline"]');
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
        }, 10000);
        
        if (!sendBtn) {
          consecutiveFailures++;
          const currentButton = dialog ? findSendButton(dialog) : findSendButton(document);
          const reason = `发送按钮未自然启用，取消本次回复。文本长度 ${normalizeText(replyText).length}，按钮状态 ${getButtonDisabledReason(currentButton)} (连续失败 ${consecutiveFailures} 次)`;
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
    insertByExecCommand,
    insertByPasteEvent,
    insertByDirectInput
  ];

  for (const method of methods) {
    try {
      await method(element, normalized);
      await sleep(650);
      if (getEditorText(element) === normalized) {
        await sleep(1200);
        return;
      }
    } catch (error) {
      addLog('warn', `输入方法失败，尝试下一种: ${error.message}`);
    }
  }

  await sleep(1200);
}

async function prepareEditor(element) {
  element.focus();
  element.click();
  await sleep(120);
  try {
    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
  } catch (e) {
    // Some pages block execCommand; fallback methods below still run.
  }
  if (element.isContentEditable) {
    element.textContent = '';
  } else {
    element.value = '';
  }
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
}

async function insertByExecCommand(element, text) {
  await prepareEditor(element);
  document.execCommand('insertText', false, text);
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
}

async function insertByPasteEvent(element, text) {
  await prepareEditor(element);
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "postNewTweet") {
    addLog('info', '收到后台发推指令');
    handlePendingPost();
    sendResponse({ success: true });
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
  chrome.storage.local.get(['pendingPost', 'pendingPostSource', 'isRunning'], async (result) => {
    const isManualTest = result.pendingPostSource === 'manualTest';
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
    
    addLog('info', isManualTest ? '开始执行测试发文...' : '开始执行定时发文...');
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
      addLog('success', isManualTest ? '测试推文发送成功！' : '定时推文发送成功！');
      chrome.runtime.sendMessage({
        action: 'postCompleted',
        source: result.pendingPostSource || 'queue'
      }, () => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.remove(['pendingPost', 'pendingPostId', 'pendingPostSource']);
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

})();
