// content/x_automator.js
console.log("X Auto Bot: Automator loaded on X.com");

const MAX_LOGS = 50;

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
  if (!chrome.runtime?.id) return;
  const { tweetElementId, replyText } = e.detail;
  
  chrome.storage.local.get(['isRunning'], async (result) => {
    if (!result.isRunning) return;

    const tweetNode = document.querySelector(`article[data-bot-id="${tweetElementId}"]`);
    if (!tweetNode) {
      addLog('warn', '未找到目标推文节点，取消回复');
      return;
    }

    addLog('info', '开始执行自动回复流程...');
    chrome.storage.local.set({ isTyping: true });
    try {
      // 1. Click the Reply button
      const replyBtn = tweetNode.querySelector('[data-testid="reply"]');
      if (!replyBtn) {
        addLog('warn', '未找到回复按钮');
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

      // 4. Click Reply Send button
      const sendBtn = document.querySelector('[data-testid="tweetButtonInline"]') || document.querySelector('[data-testid="tweetButton"]');
      if (sendBtn) {
        // Force remove disabled attribute if React hasn't updated it yet
        sendBtn.removeAttribute('disabled');
        sendBtn.click();
        addLog('success', '回复发送成功！');
        
        // Update reply stats
        chrome.storage.local.get(['stats'], (res) => {
          let stats = res.stats || { tweetsProcessed: 0, repliesSent: 0 };
          stats.repliesSent += 1;
          chrome.storage.local.set({ stats });
        });
      } else {
        addLog('error', '未找到发送按钮或按钮被禁用');
      }
      
    } catch (error) {
      addLog('error', `自动回复异常: ${error.message}`);
    } finally {
      chrome.storage.local.set({ isTyping: false });
    }
  });
});

async function simulateTyping(element, text) {
  element.focus();
  // Using execCommand is the most reliable way to interact with React's Draft.js
  document.execCommand('insertText', false, text);
  
  // Also try to dispatch input event just in case
  element.dispatchEvent(new Event('input', { bubbles: true }));
  
  await sleep(1000); // Wait for React to update the state and enable the send button
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "postNewTweet") {
    handlePendingPost();
    sendResponse({ success: true });
  }
});

// Run once on load in case the tab was newly opened by background
setTimeout(handlePendingPost, 3000);

async function handlePendingPost() {
  if (!chrome.runtime?.id) return;
  chrome.storage.local.get(['pendingPost', 'isRunning'], async (result) => {
    if (!result.pendingPost || !result.isRunning) return;
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
      
      const sendBtn = document.querySelector('[data-testid="tweetButtonInline"]') || document.querySelector('[data-testid="tweetButton"]');
      if (sendBtn) {
        sendBtn.removeAttribute('disabled');
        sendBtn.click();
        addLog('success', '定时推文发送成功！');
        // Clear pendingPost
        chrome.storage.local.remove(['pendingPost']);
      } else {
        addLog('error', '未找到推文发送按钮');
      }
      
    } catch (e) {
      addLog('error', `定时发文异常: ${e.message}`);
    } finally {
      chrome.storage.local.set({ isTyping: false });
    }
  });
}
