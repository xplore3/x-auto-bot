document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const settingsBtn = document.getElementById('settingsBtn');
  const queueCountSpan = document.getElementById('queueCount');
  const bioTextSpan = document.getElementById('bioText');
  const genStatusSpan = document.getElementById('genStatus');
  const nextPostTimeSpan = document.getElementById('nextPostTime');

  // Load initial state
  chrome.storage.local.get(['isRunning', 'stats', 'tweetQueue', 'accountBio', 'isGenerating', 'nextPostTime', 'configErrors'], (result) => {
    updateUI(result.isRunning, result.configErrors);
    if (result.stats) {
      document.getElementById('tweetsProcessed').textContent = result.stats.tweetsProcessed || 0;
      document.getElementById('repliesSent').textContent = result.stats.repliesSent || 0;
    }
    updateDashboard(result);
  });

  // Toggle button logic
  toggleBtn.addEventListener('click', () => {
    chrome.storage.local.get(['isRunning', 'apiKey', 'apiProvider', 'aiModel', 'leadTarget'], (result) => {
      const newState = !result.isRunning;
      
      // 如果要启动，先检查配置
      if (newState) {
        const missing = [];
        if (!result.apiKey) missing.push('API Key');
        if (!result.leadTarget) missing.push('引流目标');
        if (result.apiProvider && result.apiProvider !== 'gemini' && !result.aiModel) missing.push('模型名称');
        
        if (missing.length > 0) {
          statusText.textContent = `❌ 缺少: ${missing.join('、')}`;
          statusText.style.color = '#f5a623';
          statusIndicator.classList.remove('active');
          // 2秒后恢复状态显示
          setTimeout(() => {
            chrome.storage.local.get(['isRunning'], (r) => {
              updateUI(r.isRunning);
            });
          }, 3000);
          // 打开配置页
          chrome.runtime.openOptionsPage();
          return;
        }
      }
      
      chrome.storage.local.set({ isRunning: newState }, () => {
        updateUI(newState);
      });
    });
  });

  // Open settings
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  function updateDashboard(data) {
    if (data.tweetQueue) {
       queueCountSpan.textContent = data.tweetQueue.length + " / 20";
    }
    if (data.accountBio) {
       bioTextSpan.textContent = data.accountBio;
    } else {
       bioTextSpan.textContent = '请先在 X 主页开启自动化以读取简介...';
    }
    if (data.isGenerating) {
       genStatusSpan.textContent = "生成中 🔄";
       genStatusSpan.style.color = "#1DA1F2";
    } else {
       genStatusSpan.textContent = "待机";
       genStatusSpan.style.color = "#17bf63";
    }
    if (data.nextPostTime) {
       nextPostTimeSpan.textContent = data.nextPostTime;
    } else {
       nextPostTimeSpan.textContent = "暂无计划";
    }
  }

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    chrome.storage.local.get(['tweetQueue', 'accountBio', 'isGenerating', 'nextPostTime', 'configErrors', 'isRunning'], (result) => {
       updateDashboard(result);
       updateUI(result.isRunning, result.configErrors);
    });
  });
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      chrome.storage.local.get(['isRunning', 'configErrors'], (result) => {
        updateUI(result.isRunning, result.configErrors);
      });
    }
  });

  function updateUI(isRunning, configErrors) {
    statusText.style.color = '';
    if (isRunning) {
      statusIndicator.classList.add('active');
      statusText.textContent = '运行中';
      toggleBtn.textContent = '停止自动化';
      toggleBtn.classList.add('stop');
    } else {
      statusIndicator.classList.remove('active');
      toggleBtn.textContent = '启动自动化';
      toggleBtn.classList.remove('stop');
      
      if (configErrors && configErrors.length > 0) {
        statusText.textContent = `⚠️ ${configErrors.join('、')}`;
        statusText.style.color = '#f5a623';
      } else {
        statusText.textContent = '已停止';
      }
    }
  }
});
