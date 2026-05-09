// background.js

const MAX_LOGS = 50;

function addLog(level, message) {
  const entry = {
    time: Date.now(),
    level: level,
    message: message,
    source: 'background'
  };
  chrome.storage.local.get(['logs'], (result) => {
    let logs = result.logs || [];
    logs.push(entry);
    if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
    chrome.storage.local.set({ logs });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  console.log("X Auto Bot extension installed.");
  addLog('info', '扩展程序已安装/更新');
  // 初始化默认配置
  chrome.storage.local.get(['apiKey', 'targetUsers', 'promptTemplate', 'leadTarget', 'isRunning'], (result) => {
    if (!result.hasOwnProperty('isRunning')) {
      chrome.storage.local.set({
        isRunning: false,
        apiKey: '',
        targetUsers: '',
        promptTemplate: '你是一个社交媒体引流专家。请根据推文内容，给出一段简短、神回复级别的评论（不超过 40 个字）。\n如果合适的话，请巧妙、自然地顺带提及我的【引流信息】，千万不要显得像生硬的广告，要像朋友间的随口分享：\n\n【推文】：{tweet}\n【引流信息】：{leadTarget}\n\n回复：',
        leadTarget: '',
        postInterval: 60,
        replyInterval: 30
      });
    }
  });
});

// 处理来自 content scripts 或 popup 的消息
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "generateReply") {
    addLog('info', '收到回复生成请求，调用 AI 接口...');
    // 调用大模型 API 生成回复
    generateAIResponse(request.tweetContent)
      .then(replyText => {
        addLog('success', 'AI 回复生成完成');
        sendResponse({ success: true, replyText });
      })
      .catch(error => {
        addLog('error', `AI 接口调用失败: ${error.message}`);
        sendResponse({ success: false, error: error.message, errorType: error.type || 'UNKNOWN' });
      });
    return true; // 保持通道异步开启
  } else if (request.action === "queueUpdated") {
    checkAndSetupAlarm();
  } else if (request.action === "extractBio") {
    addLog('info', `后台打开 Profile 页面: ${request.profileUrl}`);
    chrome.tabs.create({ url: `https://x.com${request.profileUrl}`, active: false }, (tab) => {
      // Listen for bio extraction to close the tab
      chrome.storage.onChanged.addListener(function listener(changes, namespace) {
        if (namespace === 'local' && changes.accountBio) {
          addLog('success', 'Profile 页面读取完成，关闭后台标签页');
          chrome.tabs.remove(tab.id);
          chrome.storage.onChanged.removeListener(listener);
        }
      });
    });
  }
});

// ==========================================
// Configuration Check
// ==========================================
function getConfigErrors(config) {
  const errors = [];
  if (!config.apiKey) errors.push('缺少 API Key');
  if (!config.leadTarget) errors.push('缺少引流目标');
  if (config.apiProvider !== 'gemini' && !config.aiModel) errors.push('缺少模型名称');
  return errors;
}

function isConfigValid(config) {
  return getConfigErrors(config).length === 0;
}

// ==========================================
// LLM Calling
// ==========================================
async function callLLM(prompt, config, requireJson = false) {
  const provider = config.apiProvider || 'gemini';
  
  // Gemini Native API
  if (provider === 'gemini') {
    const bodyObj = {
      contents: [{ parts: [{ text: prompt }] }]
    };
    if (requireJson) {
      bodyObj.generationConfig = { responseMimeType: "application/json" };
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${config.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bodyObj)
    });
    const data = await response.json();
    if (data.error) {
       let err = new Error(data.error.message);
       err.type = 'RATE_LIMIT';
       throw err;
    }
    return data.candidates[0].content.parts[0].text;
  }
  
  // OpenAI-compatible providers: openrouter, qwen, deepseek
  const endpoints = {
    openrouter: 'https://openrouter.ai/api/v1/chat/completions',
    qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    deepseek: 'https://api.deepseek.com/chat/completions'
  };
  
  const endpoint = endpoints[provider];
  if (!endpoint) {
    throw new Error(`不支持的 AI 服务商: ${provider}`);
  }
  
  const model = config.aiModel || 'google/gemini-2.5-flash';
  const reqBody = {
    model: model,
    messages: [{ role: 'user', content: prompt }]
  };
  
  // JSON hint for supported providers
  if (requireJson && provider === 'deepseek') {
    reqBody.response_format = { type: "json_object" };
  }
  
  const headers = {
    'Authorization': `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json'
  };
  
  // OpenRouter requires extra headers
  if (provider === 'openrouter') {
    headers['HTTP-Referer'] = 'https://x.com';
    headers['X-Title'] = 'X Auto Bot';
  }
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(reqBody)
  });
  
  const data = await response.json();
  if (data.error) {
     let err = new Error(data.error.message || JSON.stringify(data.error));
     err.type = data.error.code === 'rate_limit_exceeded' || data.error.type === 'rate_limit' ? 'RATE_LIMIT' : 'API_ERROR';
     throw err;
  }
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('API 返回格式异常: ' + JSON.stringify(data).substring(0, 200));
  }
  return data.choices[0].message.content;
}

function checkAndSetupAlarm() {
  chrome.storage.local.get(['tweetQueue', 'isRunning'], (result) => {
    if (!result.isRunning) {
       chrome.alarms.clear("postTweetAlarm");
       return;
    }
    const queue = result.tweetQueue || [];
    if (queue.length > 0) {
      chrome.alarms.get("postTweetAlarm", (alarm) => {
        if (!alarm) {
          scheduleNextPost();
        }
      });
    } else {
      chrome.alarms.clear("postTweetAlarm");
    }
  });
}

// ==========================================
// Post Scheduling
// ==========================================
function parseTimeSlots(slotsStr) {
  if (!slotsStr) return [{ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 }];
  return slotsStr.split(',').map(s => {
    const parts = s.trim().split('-');
    const start = parseInt(parts[0], 10);
    const end = parseInt(parts[1], 10);
    return { start: isNaN(start) ? 0 : start, end: isNaN(end) ? 24 : end };
  }).filter(s => s.start < s.end);
}

function scheduleNextPost() {
  const now = new Date();
  chrome.storage.local.get([
    'postsToday', 'lastPostDate',
    'postsPerDay', 'postScheduleMode', 'smartTimeSlots', 'postInterval'
  ], (res) => {
    const postsToday = (res.lastPostDate === now.toDateString()) ? (res.postsToday || 0) : 0;
    const postsPerDay = res.postsPerDay || 10;
    const mode = res.postScheduleMode || 'smart';
    
    if (postsToday >= postsPerDay) {
      addLog('info', `今日已发 ${postsToday}/${postsPerDay} 条，暂停发推至次日`);
      scheduleForTomorrow(now, res);
      return;
    }
    
    if (mode === 'interval') {
      scheduleInterval(now, res);
    } else {
      scheduleSmart(now, res, postsToday, postsPerDay);
    }
  });
}

function scheduleInterval(now, config) {
  const interval = (config.postInterval || 60) * 60000;
  const targetTime = new Date(now.getTime() + interval);
  const targetHour = targetTime.getHours();
  const targetMin = targetTime.getMinutes();
  const addDays = targetTime.getDate() !== now.getDate() ? 1 : 0;
  setAlarm(targetHour, targetMin, addDays);
  addLog('info', `固定间隔模式：计划 ${targetTime.toLocaleString()} 发推`);
}

function scheduleSmart(now, config, postsToday, postsPerDay) {
  const slots = parseTimeSlots(config.smartTimeSlots);
  if (slots.length === 0) {
    addLog('warn', '智能时段配置为空，使用默认时段');
    slots.push({ start: 8, end: 10 }, { start: 12, end: 14 }, { start: 19, end: 23 });
  }
  
  const hour = now.getHours();
  let targetSlot = null;
  let addDays = 0;
  
  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    if (hour < slot.start) {
      // 当前时间在该时段开始之前
      targetSlot = slot;
      break;
    } else if (hour >= slot.start && hour < slot.end) {
      // 当前时间在该时段内，跳到下一个时段
      if (i + 1 < slots.length) {
        targetSlot = slots[i + 1];
      } else {
        targetSlot = slots[0];
        addDays = 1;
      }
      break;
    }
  }
  
  // 当前时间在所有时段之后
  if (!targetSlot) {
    targetSlot = slots[0];
    addDays = 1;
  }
  
  const range = Math.max(1, targetSlot.end - targetSlot.start);
  const targetHour = targetSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  
  setAlarm(targetHour, targetMin, addDays);
  const targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin);
  addLog('info', `智能分布模式：计划 ${targetTime.toLocaleString()} 发推（今日 ${postsToday}/${postsPerDay}）`);
}

function scheduleForTomorrow(now, config) {
  // 达到每日上限后，统一安排到次日第一个时段的随机时间点
  const slots = parseTimeSlots(config.smartTimeSlots);
  const firstSlot = slots[0] || { start: 8, end: 10 };
  const range = Math.max(1, firstSlot.end - firstSlot.start);
  const targetHour = firstSlot.start + Math.floor(Math.random() * range);
  const targetMin = Math.floor(Math.random() * 60);
  setAlarm(targetHour, targetMin, 1);
}

function setAlarm(targetHour, targetMin, addDays) {
  const now = new Date();
  let targetTime = new Date(now.getFullYear(), now.getMonth(), now.getDate() + addDays, targetHour, targetMin, 0, 0);
  
  if (targetTime.getTime() <= now.getTime()) {
      targetTime = new Date(now.getTime() + 5 * 60000); // fallback 5 mins later
  }
  
  const when = targetTime.getTime();
  chrome.alarms.create("postTweetAlarm", { when: when });
  addLog('info', `已安排下一次发推: ${targetTime.toLocaleString()}`);
  chrome.storage.local.set({ nextPostTime: targetTime.toLocaleString() }, () => {
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
  });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "postTweetAlarm") {
    addLog('info', '定时器触发，准备执行发推');
    executeNextPost();
  }
});

function executeNextPost() {
  chrome.storage.local.get(['tweetQueue', 'pendingPost', 'postsToday', 'lastPostDate', 'postsPerDay'], (result) => {
    let queue = result.tweetQueue || [];
    if (queue.length === 0) {
      checkAndSetupAlarm();
      return;
    }
    
    if (result.pendingPost) {
       triggerPostInTab();
       return;
    }
    
    const nextTweet = queue.shift();
    
    const now = new Date();
    const todayStr = now.toDateString();
    let postsToday = result.postsToday || 0;
    if (result.lastPostDate !== todayStr) postsToday = 0;
    postsToday++;
    const postsPerDay = result.postsPerDay || 10;
    
    addLog('info', `执行发推，今日已发 ${postsToday}/${postsPerDay} 条`);
    
    chrome.storage.local.set({ 
      tweetQueue: queue, 
      pendingPost: nextTweet.text,
      postsToday: postsToday,
      lastPostDate: todayStr
    }, () => {
      triggerPostInTab();
      checkAndSetupAlarm();
      chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
    });
  });
}

function triggerPostInTab() {
  chrome.tabs.query({ url: "*://*.x.com/*" }, (tabs) => {
    if (tabs.length > 0) {
      let tab = tabs.find(t => t.active) || tabs[0];
      addLog('info', `向标签页 ${tab.id} 发送发推指令`);
      chrome.tabs.sendMessage(tab.id, { action: "postNewTweet" });
    } else {
      addLog('info', '未找到 X.com 标签页，新建标签页');
      chrome.tabs.create({ url: "https://x.com/compose/tweet" });
    }
  });
}

async function generateAIResponse(tweetContent) {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'promptTemplate', 'leadTarget', 'aiPersona'], async (config) => {
      const errors = getConfigErrors(config);
      if (errors.length > 0) {
        addLog('warn', `配置不完整，无法生成回复：${errors.join('、')}`);
        return reject(new Error(errors.join('；')));
      }
      
      let personaContext = "";
      if (config.aiPersona) {
         personaContext = `\n【你的账号人设与特征】：${config.aiPersona.characteristics}\n【你的核心引流目标】：${config.aiPersona.goals || config.leadTarget}\n请严格符合上述人设语气进行回复。\n`;
      }
      
      const prompt = config.promptTemplate
        .replace('{tweet}', tweetContent)
        .replace('{leadTarget}', config.leadTarget || '无引流目标，请正常进行幽默回复即可')
        + personaContext;
      
      try {
        const generatedText = await callLLM(prompt, config, false);
        resolve(generatedText.trim());
      } catch (e) {
        console.warn("X Auto Bot: API Rate limit or fetch error", e);
        reject(e);
      }
    });
  });
}

async function analyzeAccountPersona(bio) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget'], async (config) => {
    const errors = getConfigErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析账号画像：${errors.join('、')}`);
      return;
    }
    addLog('info', '开始 AI 账号画像分析...');
    
    const prompt = `请分析以下 Twitter 账号简介：【${bio}】。
请基于该简介，推断并输出该账号的：
1. 目标用户群体 (targetUsers)
2. 发文特征与人设语气 (characteristics)
3. 发文及引流核心目标 (goals)

不要包含任何多余文字，严格以如下 JSON 对象格式返回：
{
  "targetUsers": "...",
  "characteristics": "...",
  "goals": "..."
}`;
    
    chrome.storage.local.set({ isAnalyzingPersona: true });
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const persona = JSON.parse(cleanJsonStr);
      
      chrome.storage.local.set({ aiPersona: persona, isAnalyzingPersona: false }, () => {
         addLog('success', '账号画像分析完成');
         analyzeCompetitors(persona);
      });
    } catch (e) {
      addLog('error', `账号画像分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingPersona: false });
    }
  });
}

async function analyzeCompetitors(persona) {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget'], async (config) => {
    const errors = getConfigErrors(config);
    if (errors.length > 0) {
      addLog('warn', `配置不完整，无法分析竞品：${errors.join('、')}`);
      return;
    }
    addLog('info', '开始竞品对标与爆款策略分析...');
    
    const prompt = `基于以下 Twitter 账号的定位：
- 目标用户：${persona.targetUsers}
- 发文特征：${persona.characteristics}
- 核心目标：${persona.goals}

作为顶级社交媒体运营专家，请生成一份详尽的《竞品对标与低粉爆款运营拆解报告》。
报告内容必须包括：
1. 【优质竞品对标】：列出 10 个类似赛道的优质竞品账号（包括头部大V和起步期账号），并一句话总结每个账号的运营亮点。
2. 【低粉爆款拆解】：深度拆解在当前赛道下，“低粉账号”想要制造爆款的 3 个核心内容框架和钩子（Hook）设计套路。
3. 【实操指导】：给出 3 条马上可以落地的执行建议。

请直接返回纯 Markdown 格式的报告内容，不要包裹在JSON里，也不要加额外的问候语。`;

    chrome.storage.local.set({ isAnalyzingCompetitors: true });
    try {
      const report = await callLLM(prompt, config, false);
      
      chrome.storage.local.set({ competitorReport: report, isAnalyzingCompetitors: false }, () => {
         addLog('success', '竞品分析报告生成完成');
         generateAutoDrafts();
      });
    } catch (e) {
      addLog('error', `竞品分析失败: ${e.message}`);
      chrome.storage.local.set({ isAnalyzingCompetitors: false });
    }
  });
}

async function generateAutoDrafts() {
  chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'isRunning', 'tweetQueue', 'isGenerating', 'aiPersona', 'accountBio', 'competitorReport'], async (config) => {
    const errors = getConfigErrors(config);
    const isPersonaEmpty = !config.aiPersona || (!config.aiPersona.targetUsers && !config.aiPersona.characteristics && !config.aiPersona.goals);
    if (!config.isRunning || errors.length > 0 || config.isGenerating || isPersonaEmpty) {
      if (errors.length > 0) {
        addLog('warn', `配置不完整，无法生成草稿：${errors.join('、')}`);
      }
      return;
    }
    let queue = config.tweetQueue || [];
    if (queue.length >= 5) return;

    addLog('info', '开始批量生成推文草稿...');
    chrome.storage.local.set({ isGenerating: true });
    chrome.runtime.sendMessage({ action: "generationStatus", status: true }).catch(() => {});
    
    const persona = config.aiPersona;
    const reportContext = config.competitorReport ? `\n另外，系统已经为您拆解了竞品和低粉爆款的套路，请【严格应用】以下套路来撰写推文：\n${config.competitorReport}\n` : "";
    
    const prompt = `你是这个 Twitter 账号的运营者。账号简介：【${config.accountBio}】。
以下是系统对你的账号画像定位：
- 目标用户：${persona.targetUsers}
- 发文特征与语气：${persona.characteristics}
- 核心发文目标：${persona.goals}
${reportContext}
请你完全接管内容创作，直接为我生成 20 条极具网感的高质量推文（可以包含适当的emoji，高度符合上述的人设和业务目标）。
必须采用上述“低粉爆款”的钩子（Hook）套路和内容框架！
不要包含任何其他解释性文字，严格以 JSON 数组格式返回（每项是一条字符串格式的推文内容）。
例如：["推文1", "推文2"]`;
    
    try {
      const generatedText = await callLLM(prompt, config, true);
      // Clean up markdown code blocks if the model wrapped it
      const cleanJsonStr = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const newTweets = JSON.parse(cleanJsonStr);
      
      if (Array.isArray(newTweets)) {
        newTweets.forEach(t => {
           queue.push({ id: Date.now() + Math.random(), text: t });
        });
        chrome.storage.local.set({ tweetQueue: queue, isGenerating: false }, () => {
           addLog('success', `成功生成 ${newTweets.length} 条推文草稿`);
           chrome.runtime.sendMessage({ action: "queueCountChanged" }).catch(() => {});
           chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
           checkAndSetupAlarm(); // re-evaluate alarm
        });
      }
    } catch (e) {
      addLog('error', `草稿生成失败: ${e.message}`);
      chrome.storage.local.set({ isGenerating: false });
      chrome.runtime.sendMessage({ action: "generationStatus", status: false }).catch(() => {});
    }
  });
}

chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'local') {
    if (changes.accountBio && changes.accountBio.newValue) {
       addLog('info', '检测到主页简介更新，触发画像分析');
       analyzeAccountPersona(changes.accountBio.newValue);
    }
    if (changes.isRunning && changes.isRunning.newValue) {
       chrome.storage.local.get(['apiKey', 'apiProvider', 'aiModel', 'leadTarget', 'accountBio', 'aiPersona'], (res) => {
          const errors = getConfigErrors(res);
          if (errors.length > 0) {
             addLog('error', `启动失败：${errors.join('、')}，请先到配置中心完善设置`);
             chrome.storage.local.set({ isRunning: false, configErrors: errors });
             return;
          }
          chrome.storage.local.remove(['configErrors']);
          addLog('info', '机器人已启动');
          const isPersonaEmpty = !res.aiPersona || (!res.aiPersona.targetUsers && !res.aiPersona.characteristics && !res.aiPersona.goals);
          if (res.accountBio && isPersonaEmpty) {
             analyzeAccountPersona(res.accountBio);
          } else if (!isPersonaEmpty) {
             generateAutoDrafts();
          }
          checkAndSetupAlarm();
       });
    } else if (changes.isRunning && !changes.isRunning.newValue) {
       addLog('info', '机器人已停止');
       chrome.alarms.clear("postTweetAlarm");
       chrome.storage.local.remove(['pendingPost']);
    }
    if (changes.tweetQueue) {
       chrome.storage.local.get(['aiPersona'], (res) => {
          if (res.aiPersona && changes.tweetQueue.newValue && changes.tweetQueue.newValue.length < 5) {
             generateAutoDrafts();
          }
       });
    }
    if (changes.aiPersona && changes.aiPersona.newValue) {
       const p = changes.aiPersona.newValue;
       const isPersonaEmpty = !p || (!p.targetUsers && !p.characteristics && !p.goals);
       if (isPersonaEmpty) {
          chrome.storage.local.get(['accountBio'], (res) => {
             if (res.accountBio) analyzeAccountPersona(res.accountBio);
          });
       } else {
          chrome.storage.local.get(['tweetQueue'], (res) => {
             const q = res.tweetQueue || [];
             if (q.length < 5) generateAutoDrafts();
          });
       }
    }
  }
});
