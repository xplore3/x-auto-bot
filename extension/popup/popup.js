document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggleBtn');
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const settingsBtn = document.getElementById('settingsBtn');
  const queueCountSpan = document.getElementById('queueCount');
  const strategySignal = document.getElementById('strategySignal');
  const genStatusSpan = document.getElementById('genStatus');
  const nextPostTimeSpan = document.getElementById('nextPostTime');
  const stepConfig = document.getElementById('stepConfig');
  const stepPersona = document.getElementById('stepPersona');
  const stepQueue = document.getElementById('stepQueue');

  // Load initial state
  chrome.storage.local.get(['isRunning', 'stats', 'tweetQueue', 'accountBio', 'isGenerating', 'nextPostTime', 'configErrors', 'apiKey', 'leadTarget', 'aiPersona', 'agentMemory', 'onboardingStrategy'], (result) => {
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
        if ((result.apiProvider || 'gemini') !== 'gemini' && !result.aiModel) missing.push('模型名称');
        
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
    const queueLength = data.tweetQueue ? data.tweetQueue.length : 0;
    queueCountSpan.textContent = queueLength + " / 20";

    renderStrategySignal(data);

    if (data.isGenerating) {
       genStatusSpan.textContent = "生成中";
       genStatusSpan.style.color = "#0f8bd6";
    } else {
       genStatusSpan.textContent = "待机";
       genStatusSpan.style.color = "#0f9f6e";
    }

    if (data.nextPostTime) {
       nextPostTimeSpan.textContent = data.nextPostTime;
    } else {
       nextPostTimeSpan.textContent = "暂无计划";
    }

    const hasConfig = Boolean(data.apiKey && data.leadTarget);
    const persona = data.aiPersona || {};
    const hasPersona = Boolean(persona.targetUsers || persona.characteristics || persona.goals);
    setStepState(stepConfig, hasConfig, data.configErrors && data.configErrors.length > 0);
    setStepState(stepPersona, hasPersona, false);
    setStepState(stepQueue, queueLength > 0, false);
  }

  // Listen for updates from background
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    chrome.storage.local.get(['tweetQueue', 'accountBio', 'isGenerating', 'nextPostTime', 'configErrors', 'isRunning', 'apiKey', 'leadTarget', 'aiPersona', 'agentMemory', 'onboardingStrategy'], (result) => {
       updateDashboard(result);
       updateUI(result.isRunning, result.configErrors);
    });
  });
  
  // Listen for storage changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'local') {
      chrome.storage.local.get(['isRunning', 'configErrors', 'tweetQueue', 'accountBio', 'isGenerating', 'nextPostTime', 'apiKey', 'leadTarget', 'aiPersona', 'agentMemory', 'onboardingStrategy'], (result) => {
        updateUI(result.isRunning, result.configErrors);
        updateDashboard(result);
      });
    }
  });

  function renderStrategySignal(data) {
    const persona = data.aiPersona || {};
    const memory = data.agentMemory || {};
    const strategy = data.onboardingStrategy || {};
    const rows = [
      ['角色', summarizeRole(strategy, memory)],
      ['读者', firstFilled(persona.targetUsers, memory.audienceSegments)],
      ['内容飞轮', firstFilled(memory.contentPillars, memory.contentAngles)],
      ['爆款风格', summarizeStyle(strategy, persona, memory)]
    ].filter(([, value]) => value);

    if (rows.length === 0) {
      strategySignal.innerHTML = '<div class="signal-empty">请先完成设置页的一键分析，Agent 会在这里显示账号角色、目标用户、内容飞轮和爆款风格。</div>';
      return;
    }

    strategySignal.innerHTML = rows.map(([label, value]) => `
      <div class="signal-row">
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(compactText(value, 86))}</strong>
      </div>
    `).join('');
  }

  function summarizeRole(strategy, memory) {
    const roleMap = {
      brand: '官方品牌账号',
      evangelist: '首席推销官',
      curator: '赛道观察家',
      kol: '赛道 KOL'
    };
    return firstFilled(roleMap[strategy.accountUse], memory.marketPosition, memory.identity);
  }

  function summarizeStyle(strategy, persona, memory) {
    const styleMap = {
      concise: '极简利落流',
      story: '故事悬念流',
      contrarian: '观点对抗流'
    };
    const parts = [
      styleMap[strategy.postStyle],
      strategy.growthGoal,
      firstFilled(persona.characteristics, memory.voiceRules)
    ].filter(Boolean);
    return parts.join(' · ');
  }

  function firstFilled(...values) {
    return values.find(value => typeof value === 'string' && value.trim()) || '';
  }

  function compactText(text, limit) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
  }

  function escapeHtml(text) {
    return String(text || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function updateUI(isRunning, configErrors) {
    statusText.style.color = '';
    if (isRunning) {
      statusIndicator.classList.add('active');
      statusText.textContent = '运行中';
      toggleBtn.textContent = '停止 Agent';
      toggleBtn.classList.add('stop');
    } else {
      statusIndicator.classList.remove('active');
      toggleBtn.textContent = '启动 Agent';
      toggleBtn.classList.remove('stop');
      
      if (configErrors && configErrors.length > 0) {
        statusText.textContent = `待配置：${configErrors.join('、')}`;
        statusText.style.color = '#b7791f';
      } else {
        statusText.textContent = '已停止';
      }
    }
  }

  function setStepState(element, isDone, hasWarning) {
    if (!element) return;
    element.classList.toggle('done', Boolean(isDone));
    element.classList.toggle('warning', Boolean(hasWarning && !isDone));
  }
});
