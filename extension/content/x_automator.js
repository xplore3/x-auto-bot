// content/x_automator.js
(function() {
'use strict';

console.log("X Auto Bot: Automator loaded on X.com");

const MAX_LOGS = 50;
let isAutomatorBusy = false;

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
      addLog('warn', `未找到 @${author} 的目标推文节点，取消回复`);
      isAutomatorBusy = false;
      return;
    }

    addLog('info', `开始回复 @${author}...`);
    chrome.storage.local.set({ isTyping: true });
    try {
      // 1. Click the Reply button
      const replyBtn = tweetNode.querySelector('[data-testid="reply"]');
      if (!replyBtn) {
        addLog('warn', `未找到 @${author} 推文的回复按钮`);
        return;
      }
      replyBtn.click();
      addLog('info', '已点击回复按钮');
      
      // Wait for the modal dialog / input field to appear
      await sleep(1500); 

      // 2. Find the input field inside the modal
      const draftEditor = document.querySelector('div[data-testid="tweetTextarea_0"]');
      if (!draftEditor) {
        addLog('warn', '未找到回复输入框');
        return;
      }
      addLog('info', '已定位到输入框，准备模拟输入');

      // 3. Simulate typing
      await simulateTyping(draftEditor, replyText);
      addLog('info', `已输入回复内容 (${replyText.length} 字)`);

      // 4. Find send button INSIDE the dialog (not globally)
      const dialog = draftEditor.closest('div[role="dialog"]') || document.querySelector('div[role="dialog"]');
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
        
        // 等待 React 状态更新
        let retryCount = 0;
        while ((sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') && retryCount < 8) {
          addLog('info', `发送按钮仍被禁用，第 ${retryCount + 1} 次等待...`);
          await sleep(600);
          // Re-find button in case DOM changed
          const d = document.querySelector('div[role="dialog"]');
          sendBtn = d 
            ? (d.querySelector('[data-testid="tweetButton"]') || d.querySelector('[data-testid="tweetButtonInline"]'))
            : sendBtn;
          if (!sendBtn) break;
          retryCount++;
        }
        
        if (!sendBtn) {
          addLog('error', '重试过程中按钮从 DOM 中消失');
        } else {
          // 强制启用按钮
          sendBtn.removeAttribute('disabled');
          sendBtn.setAttribute('aria-disabled', 'false');
          
          // 触发完整的事件序列，确保 React 能捕获
          simulateRealClick(sendBtn);
          addLog('info', '已触发发送按钮点击事件');
          
          await sleep(1000);
          
          // 如果弹窗还在，再点一次
          const stillModal = document.querySelector('div[role="dialog"]') || document.querySelector('div[data-testid="tweetTextarea_0"]');
          if (stillModal) {
            addLog('warn', '弹窗仍在，执行第2次点击');
            simulateRealClick(sendBtn);
            await sleep(1000);
          }
        }
        
        // 最终判断
        const modalGone = !(document.querySelector('div[role="dialog"]') || document.querySelector('div[data-testid="tweetTextarea_0"]'));
        const shortOriginal = originalText.substring(0, 50) + (originalText.length > 50 ? '...' : '');
        const shortReply = replyText.substring(0, 80) + (replyText.length > 80 ? '...' : '');
        
        if (modalGone) {
          addLog('success', `✅ 已回复 @${author} | 原文：「${shortOriginal}」→ 回复：「${shortReply}」`);
        } else {
          addLog('warn', `⚠️ 弹窗仍在，可能发送失败，请手动检查 @${author} 的回复`);
        }
        
        // Update reply stats
        chrome.storage.local.get(['stats'], (res) => {
          let stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
          stats.repliesSent += 1;
          chrome.storage.local.set({ stats });
        });
      } else {
        addLog('error', '未找到发送按钮，回复未完成');
      }
      
    } catch (error) {
      addLog('error', `自动回复异常: ${error.message}`);
    } finally {
      chrome.storage.local.set({ isTyping: false });
      isAutomatorBusy = false;
    }
  });
});

async function simulateTyping(element, text) {
  element.focus();
  element.click();
  
  // 最可靠的方式：直接设置内容再触发事件
  // X.com 使用 contenteditable div
  if (element.isContentEditable) {
    element.textContent = text;
  } else {
    element.value = text;
  }
  
  // 触发完整的事件序列让 React 识别到内容变化
  element.dispatchEvent(new Event('focus', { bubbles: true }));
  element.dispatchEvent(new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'a' }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: 'a' }));
  
  await sleep(2000); // 给 React 足够时间更新状态和启用按钮
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
  chrome.storage.local.get(['pendingPost', 'isRunning'], async (result) => {
    if (!result.isRunning) {
      addLog('info', '机器人已停止，跳过发推');
      return;
    }
    if (!result.pendingPost) {
      addLog('warn', '没有待发送的推文内容');
      return;
    }
    
    isAutomatorBusy = true;
    const postText = result.pendingPost;
    
    addLog('info', '开始执行定时发文...');
    chrome.storage.local.set({ isTyping: true });
    try {
      // Find global new tweet button
      let newTweetBtn = document.querySelector('[data-testid="SideNav_NewTweet_Button"]');
      
      // If we are on /compose/tweet page, the input might already be open
      let draftEditor = document.querySelector('div[data-testid="tweetTextarea_0"]');
      
      if (!draftEditor && newTweetBtn) {
        newTweetBtn.click();
        addLog('info', '已点击发推按钮');
        await sleep(1500);
        draftEditor = document.querySelector('div[data-testid="tweetTextarea_0"]');
      }
      
      if (!draftEditor) {
        addLog('warn', '未找到推文编辑器');
        return;
      }
      
      await simulateTyping(draftEditor, postText);
      addLog('info', `已输入推文内容 (${postText.length} 字)`);
      
      // Find send button inside the dialog
      const postDialog = draftEditor.closest('div[role="dialog"]') || document.querySelector('div[role="dialog"]');
      let sendBtn = null;
      
      if (postDialog) {
        sendBtn = postDialog.querySelector('[data-testid="tweetButton"]') || postDialog.querySelector('[data-testid="tweetButtonInline"]');
      }
      if (!sendBtn) {
        sendBtn = document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]');
      }
      
      if (!sendBtn) {
        addLog('warn', '第1次尝试：未找到发推按钮，等待重试...');
        await sleep(1500);
        const retryDialog = document.querySelector('div[role="dialog"]');
        sendBtn = retryDialog 
          ? (retryDialog.querySelector('[data-testid="tweetButton"]') || retryDialog.querySelector('[data-testid="tweetButtonInline"]'))
          : (document.querySelector('[data-testid="tweetButton"]') || document.querySelector('[data-testid="tweetButtonInline"]'));
      }
      
      if (sendBtn) {
        addLog('info', `找到发推按钮，当前 disabled=${sendBtn.disabled}`);
        
        let retryCount = 0;
        while ((sendBtn.disabled || sendBtn.getAttribute('aria-disabled') === 'true') && retryCount < 8) {
          addLog('info', `发推按钮仍被禁用，第 ${retryCount + 1} 次等待...`);
          await sleep(600);
          const d = document.querySelector('div[role="dialog"]');
          sendBtn = d 
            ? (d.querySelector('[data-testid="tweetButton"]') || d.querySelector('[data-testid="tweetButtonInline"]'))
            : sendBtn;
          if (!sendBtn) break;
          retryCount++;
        }
        
        if (!sendBtn) {
          addLog('error', '重试过程中按钮从 DOM 中消失');
        } else {
          sendBtn.removeAttribute('disabled');
          sendBtn.setAttribute('aria-disabled', 'false');
          simulateRealClick(sendBtn);
          addLog('info', '已触发发推按钮点击事件');
          await sleep(1000);
          
          const stillModal = document.querySelector('div[role="dialog"]') || document.querySelector('div[data-testid="tweetTextarea_0"]');
          if (stillModal) {
            addLog('warn', '弹窗仍在，执行第2次点击');
            simulateRealClick(sendBtn);
            await sleep(1000);
          }
          
          const modalGone = !(document.querySelector('div[role="dialog"]') || document.querySelector('div[data-testid="tweetTextarea_0"]'));
          if (modalGone) {
            addLog('success', '定时推文发送成功！');
            chrome.storage.local.remove(['pendingPost']);
          } else {
            addLog('warn', '弹窗仍在，发推可能未完成');
            chrome.storage.local.remove(['pendingPost']);
          }
        }
      } else {
        addLog('error', '未找到发推按钮');
      }
      
    } catch (e) {
      addLog('error', `定时发文异常: ${e.message}`);
    } finally {
      chrome.storage.local.set({ isTyping: false });
      isAutomatorBusy = false;
    }
  });
}

})();
