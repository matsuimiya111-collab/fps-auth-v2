(() => {
  if (window.__FPS_AUTH_V2_LOADED__) return;
  window.__FPS_AUTH_V2_LOADED__ = true;

  const VERIFY_API_URL = "https://fps-auth-v2.vercel.app/api/verify";
  const AUTH_KEY = "fps_auth_v2_state";
  const UI_KEY = "fps_auth_v2_ui_state";
  const DATA_KEY = "fps_data_v2";
  const FILTER_KEY = "fps_filter_v2";
  const AUTH_TTL_MS = 24 * 60 * 60 * 1000;

  const $ = (sel, root = document) => root.querySelector(sel);

  function nowMs() {
    return Date.now();
  }

  function maskCode(code) {
    if (!code || code.length <= 4) return code || "";
    return code.slice(0, 2) + "****" + code.slice(-2);
  }

  function saveToStorage(obj) {
    return new Promise((resolve) => chrome.storage.local.set(obj, resolve));
  }

  function getFromStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.get(keys, resolve));
  }

  function removeFromStorage(keys) {
    return new Promise((resolve) => chrome.storage.local.remove(keys, resolve));
  }

  function isAuthExpired(auth) {
    if (!auth || !auth.loginAt) return true;
    return nowMs() - auth.loginAt > AUTH_TTL_MS;
  }

  async function saveAuthState(authState) {
    await saveToStorage({ [AUTH_KEY]: authState });
  }

  async function loadAuthState() {
    const data = await getFromStorage([AUTH_KEY]);
    return data[AUTH_KEY] || null;
  }

  async function clearAuthState() {
    await removeFromStorage([AUTH_KEY]);
  }

  async function saveUiState(uiState) {
    await saveToStorage({ [UI_KEY]: uiState });
  }

  async function loadUiState() {
    const data = await getFromStorage([UI_KEY]);
    return data[UI_KEY] || { minimized: false, hidden: false };
  }

  async function saveFilterState(filterState) {
    await saveToStorage({ [FILTER_KEY]: filterState });
  }

  async function loadFilterState() {
    const data = await getFromStorage([FILTER_KEY]);
    return data[FILTER_KEY] || {
      homeMin: "",
      homeMax: "",
      incomeMin: "",
      incomeMax: ""
    };
  }

  async function loadDataList() {
    const data = await getFromStorage([DATA_KEY]);
    return data[DATA_KEY] || [];
  }

  async function saveDataList(list) {
    await saveToStorage({ [DATA_KEY]: list });
  }

  function showToast(msg, isError = false) {
    const toast = document.createElement("div");
    toast.textContent = msg;
    toast.style.cssText = `
      position: fixed;
      right: 24px;
      bottom: 24px;
      z-index: 2147483647;
      background: ${isError ? "#b91c1c" : "#0f766e"};
      color: #fff;
      padding: 10px 14px;
      border-radius: 10px;
      font-size: 13px;
      box-shadow: 0 10px 25px rgba(0,0,0,.25);
      max-width: 360px;
      line-height: 1.5;
      white-space: pre-wrap;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }

  async function verifyCode(code) {
    const url = `${VERIFY_API_URL}?code=${encodeURIComponent(code)}`;
    const res = await fetch(url, {
      method: "GET",
      cache: "no-store"
    });
    return res.json();
  }

  function parseMoneyToNumber(text) {
    if (!text) return null;
    const digits = String(text).replace(/[^\d]/g, "");
    if (!digits) return null;
    return Number(digits);
  }

  function normalizePhone(phone) {
    return String(phone || "").replace(/[^\d]/g, "");
  }

  function isLikelyName(line) {
    if (!line) return false;
    if (line.length > 60) return false;
    if (/^(Address|Relatives|Phone number|Dwelling Type|Length of Residence|Median Home Value|Median Household Income|Open report|Show More|Filters|Sponsored|Public Records|Search Report)/i.test(line)) {
      return false;
    }
    return /^[A-Z][a-zA-Z'.-]+(?:\s+[A-Z][a-zA-Z'.-]+){1,3}$/.test(line);
  }

  function isAddressLine(line) {
    if (!line) return false;
    return /\d{1,6}\s+.+/.test(line) && /[A-Z]{2}\s+\d{5}(?:-\d{4})?$/.test(line);
  }

  function extractPeopleData() {
    const text = document.body.innerText || "";
    const lines = text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const results = [];
    let current = null;

    function pushCurrent() {
      if (!current) return;
      if (current.name && current.phone) {
        results.push({
          name: current.name || "",
          phone: current.phone || "",
          address: current.address || "",
          homeValueText: current.homeValueText || "",
          homeValue: current.homeValue ?? null,
          incomeText: current.incomeText || "",
          income: current.income ?? null,
          years: current.years || "",
          dwellingType: current.dwellingType || ""
        });
      }
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (isLikelyName(line)) {
        pushCurrent();
        current = {
          name: line,
          phone: "",
          address: "",
          homeValueText: "",
          homeValue: null,
          incomeText: "",
          income: null,
          years: "",
          dwellingType: ""
        };
        continue;
      }

      if (!current) continue;

      const phoneMatch = line.match(/\(\d{3}\)\s*\d{3}-\d{4}/);
      if (phoneMatch && !current.phone) {
        current.phone = phoneMatch[0];
      }

      if (/^Address:/i.test(line)) {
        const after = line.replace(/^Address:\s*/i, "").trim();
        if (after) {
          current.address = after;
        } else if (lines[i + 1]) {
          current.address = lines[i + 1];
        }
      } else if (!current.address && isAddressLine(line)) {
        current.address = line;
      }

      if (/^Median Home Value:/i.test(line)) {
        const money = line.match(/\$[\d,]+/);
        if (money) {
          current.homeValueText = money[0];
          current.homeValue = parseMoneyToNumber(money[0]);
        }
      }

      if (/^Median Household Income:/i.test(line)) {
        const money = line.match(/\$[\d,]+/);
        if (money) {
          current.incomeText = money[0];
          current.income = parseMoneyToNumber(money[0]);
        }
      }

      if (/^Length of Residence:/i.test(line)) {
        current.years = line.replace(/^Length of Residence:\s*/i, "").trim();
      }

      if (/^Dwelling Type:/i.test(line)) {
        current.dwellingType = line.replace(/^Dwelling Type:\s*/i, "").trim();
      }
    }

    pushCurrent();
    return results;
  }

  function withinRange(value, min, max) {
    if (value == null || Number.isNaN(value)) return true; // 空值放行
    if (min !== "" && value < Number(min)) return false;
    if (max !== "" && value > Number(max)) return false;
    return true;
  }

  function filterPeopleData(list, filters) {
    return list.filter((item) => {
      // 必填：姓名 + 电话；地址改为可选
      if (!item.name || !item.phone) return false;

      const homePass = withinRange(item.homeValue, filters.homeMin, filters.homeMax);
      const incomePass = withinRange(item.income, filters.incomeMin, filters.incomeMax);

      return homePass && incomePass;
    });
  }

  async function mergeIntoTotalTable(list) {
    const oldList = await loadDataList();
    const map = {};

    oldList.forEach((item) => {
      const key = normalizePhone(item.phone) || `${item.name}__${item.address}`;
      map[key] = item;
    });

    list.forEach((item) => {
      const key = normalizePhone(item.phone) || `${item.name}__${item.address}`;
      map[key] = item;
    });

    const merged = Object.values(map);
    await saveDataList(merged);
    return {
      oldCount: oldList.length,
      newCount: merged.length
    };
  }

  async function clearTotalTable() {
    await saveDataList([]);
  }

  const panel = document.createElement("div");
  panel.id = "fpsAuthV2Panel";
  panel.innerHTML = `
    <div class="fps-header">
      <div class="fps-title-wrap">
        <div class="fps-title">FPS 提取工具 V2</div>
        <div class="fps-subtitle">授权登录版</div>
      </div>
      <div class="fps-header-actions">
        <button class="fps-btn-icon" id="fpsMinBtn" title="最小化">—</button>
        <button class="fps-btn-icon" id="fpsHideBtn" title="隐藏">×</button>
      </div>
    </div>

    <div class="fps-body" id="fpsBody">
      <div id="fpsLoginView">
        <div class="fps-section">
          <div class="fps-label">授权码登录</div>
          <input id="fpsCodeInput" class="fps-input" type="text" placeholder="请输入授权码" />
          <button id="fpsLoginBtn" class="fps-btn-primary">登录</button>
          <div id="fpsLoginStatus" class="fps-status">请输入授权码后登录</div>
        </div>
      </div>

      <div id="fpsMainView" style="display:none;">
        <div class="fps-section">
          <div class="fps-kv"><span>登录状态</span><span id="fpsAuthStatus">已登录</span></div>
          <div class="fps-kv"><span>授权码</span><span id="fpsCodeMasked">--</span></div>
          <div class="fps-kv"><span>剩余次数</span><span id="fpsRemaining">--</span></div>
          <div class="fps-kv"><span>过期时间</span><span id="fpsExpireText">--</span></div>
        </div>

        <div class="fps-section">
          <button id="fpsRefreshBtn" class="fps-btn-secondary">刷新授权状态</button>
          <button id="fpsLogoutBtn" class="fps-btn-danger">退出登录</button>
          <div id="fpsMainStatus" class="fps-status">授权已通过，可以开始提取当前页面</div>
        </div>

        <div class="fps-section">
          <div class="fps-label">筛选条件</div>

          <div class="fps-grid2">
            <input id="fpsHomeMin" class="fps-input small" type="number" placeholder="房价最小值" />
            <input id="fpsHomeMax" class="fps-input small" type="number" placeholder="房价最大值" />
          </div>

          <div class="fps-grid2">
            <input id="fpsIncomeMin" class="fps-input small" type="number" placeholder="收入最小值" />
            <input id="fpsIncomeMax" class="fps-input small" type="number" placeholder="收入最大值" />
          </div>

          <div class="fps-status">规则：姓名 + 电话必填；地址改为可选。房价/收入为空时放行，有值时按区间判断。</div>
        </div>

        <div class="fps-section">
          <button id="fpsAppendBtn" class="fps-btn-primary">追加本页到总表</button>
          <button id="fpsCountBtn" class="fps-btn-secondary">查看总表条数</button>
          <button id="fpsClearBtn" class="fps-btn-danger">清空总表</button>
          <div id="fpsAppendStatus" class="fps-status">当前阶段：先提取并保存，不扣次数</div>
        </div>

        <div class="fps-section">
          <div class="fps-label">功能预览</div>
          <div class="fps-placeholder">
            下一步接入：成功追加后调用 consume 扣次数、CSV 导出、结果预览
          </div>
        </div>
      </div>
    </div>
  `;

  const miniBtn = document.createElement("button");
  miniBtn.id = "fpsAuthV2MiniRestore";
  miniBtn.textContent = "FPS";
  miniBtn.style.display = "none";

  const style = document.createElement("style");
  style.textContent = `
    #fpsAuthV2Panel {
      position: fixed;
      top: 80px;
      right: 18px;
      width: 340px;
      background: #ffffff;
      color: #111827;
      border-radius: 16px;
      box-shadow: 0 18px 45px rgba(0,0,0,.22);
      z-index: 2147483646;
      font-family: Arial, sans-serif;
      overflow: hidden;
      border: 1px solid rgba(0,0,0,.08);
    }

    #fpsAuthV2MiniRestore {
      position: fixed;
      right: 18px;
      top: 80px;
      z-index: 2147483647;
      border: none;
      border-radius: 999px;
      background: #2563eb;
      color: #fff;
      width: 54px;
      height: 54px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 10px 24px rgba(37,99,235,.35);
    }

    #fpsAuthV2Panel * {
      box-sizing: border-box;
    }

    .fps-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: linear-gradient(135deg, #2563eb, #1d4ed8);
      color: #fff;
      padding: 14px 14px 12px;
    }

    .fps-title {
      font-size: 16px;
      font-weight: 700;
      line-height: 1.2;
    }

    .fps-subtitle {
      font-size: 12px;
      opacity: .9;
      margin-top: 3px;
    }

    .fps-header-actions {
      display: flex;
      gap: 8px;
    }

    .fps-btn-icon {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 8px;
      background: rgba(255,255,255,.18);
      color: #fff;
      cursor: pointer;
      font-size: 14px;
    }

    .fps-body {
      padding: 14px;
      background: #f8fafc;
      max-height: 75vh;
      overflow: auto;
    }

    .fps-section {
      background: #fff;
      border-radius: 12px;
      padding: 12px;
      margin-bottom: 12px;
      border: 1px solid #e5e7eb;
    }

    .fps-label {
      font-size: 13px;
      font-weight: 700;
      margin-bottom: 8px;
      color: #111827;
    }

    .fps-input {
      width: 100%;
      height: 38px;
      border: 1px solid #cbd5e1;
      border-radius: 10px;
      padding: 0 12px;
      outline: none;
      font-size: 14px;
      margin-bottom: 10px;
      background: #fff;
    }

    .fps-input.small {
      margin-bottom: 8px;
    }

    .fps-input:focus {
      border-color: #2563eb;
      box-shadow: 0 0 0 3px rgba(37,99,235,.12);
    }

    .fps-grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }

    .fps-btn-primary,
    .fps-btn-secondary,
    .fps-btn-danger {
      width: 100%;
      height: 38px;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      margin-bottom: 8px;
    }

    .fps-btn-primary {
      background: #2563eb;
      color: #fff;
    }

    .fps-btn-secondary {
      background: #0f766e;
      color: #fff;
    }

    .fps-btn-danger {
      background: #dc2626;
      color: #fff;
    }

    .fps-status {
      font-size: 12px;
      color: #475569;
      line-height: 1.5;
      margin-top: 4px;
      word-break: break-word;
      white-space: pre-wrap;
    }

    .fps-kv {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      padding: 6px 0;
      border-bottom: 1px dashed #e5e7eb;
    }

    .fps-kv:last-child {
      border-bottom: none;
    }

    .fps-placeholder {
      font-size: 12px;
      color: #475569;
      line-height: 1.6;
      background: #f8fafc;
      padding: 10px;
      border-radius: 10px;
    }
  `;

  document.documentElement.appendChild(style);
  document.body.appendChild(panel);
  document.body.appendChild(miniBtn);

  const bodyEl = $("#fpsBody", panel);
  const loginView = $("#fpsLoginView", panel);
  const mainView = $("#fpsMainView", panel);

  const codeInput = $("#fpsCodeInput", panel);
  const loginBtn = $("#fpsLoginBtn", panel);
  const loginStatus = $("#fpsLoginStatus", panel);

  const authStatus = $("#fpsAuthStatus", panel);
  const codeMasked = $("#fpsCodeMasked", panel);
  const remainingEl = $("#fpsRemaining", panel);
  const expireText = $("#fpsExpireText", panel);
  const refreshBtn = $("#fpsRefreshBtn", panel);
  const logoutBtn = $("#fpsLogoutBtn", panel);
  const mainStatus = $("#fpsMainStatus", panel);

  const homeMinInput = $("#fpsHomeMin", panel);
  const homeMaxInput = $("#fpsHomeMax", panel);
  const incomeMinInput = $("#fpsIncomeMin", panel);
  const incomeMaxInput = $("#fpsIncomeMax", panel);

  const appendBtn = $("#fpsAppendBtn", panel);
  const countBtn = $("#fpsCountBtn", panel);
  const clearBtn = $("#fpsClearBtn", panel);
  const appendStatus = $("#fpsAppendStatus", panel);

  const minBtn = $("#fpsMinBtn", panel);
  const hideBtn = $("#fpsHideBtn", panel);

  function updateExpireText(loginAt) {
    if (!loginAt) {
      expireText.textContent = "--";
      return;
    }
    const expireAt = new Date(loginAt + AUTH_TTL_MS);
    expireText.textContent = expireAt.toLocaleString();
  }

  function renderLoggedOut(msg = "请输入授权码后登录") {
    loginView.style.display = "block";
    mainView.style.display = "none";
    loginStatus.textContent = msg;
    codeInput.value = "";
  }

  function renderLoggedIn(auth) {
    loginView.style.display = "none";
    mainView.style.display = "block";
    authStatus.textContent = "已登录";
    codeMasked.textContent = maskCode(auth.code);
    remainingEl.textContent = String(auth.remaining ?? "--");
    updateExpireText(auth.loginAt);
    mainStatus.textContent = "授权已通过，可以开始提取当前页面";
  }

  async function restoreFilters() {
    const filters = await loadFilterState();
    homeMinInput.value = filters.homeMin;
    homeMaxInput.value = filters.homeMax;
    incomeMinInput.value = filters.incomeMin;
    incomeMaxInput.value = filters.incomeMax;
  }

  async function persistFilters() {
    await saveFilterState({
      homeMin: homeMinInput.value.trim(),
      homeMax: homeMaxInput.value.trim(),
      incomeMin: incomeMinInput.value.trim(),
      incomeMax: incomeMaxInput.value.trim()
    });
  }

  [homeMinInput, homeMaxInput, incomeMinInput, incomeMaxInput].forEach((el) => {
    el.addEventListener("input", persistFilters);
  });

  async function tryAutoLogin() {
    const auth = await loadAuthState();
    if (!auth) {
      renderLoggedOut();
      return;
    }

    if (isAuthExpired(auth)) {
      await clearAuthState();
      renderLoggedOut("登录已过期，请重新输入授权码");
      return;
    }

    renderLoggedIn(auth);
  }

  async function handleLogin() {
    const code = (codeInput.value || "").trim();
    if (!code) {
      loginStatus.textContent = "请输入授权码";
      return;
    }

    loginBtn.disabled = true;
    loginBtn.textContent = "登录中...";
    loginStatus.textContent = "正在验证授权码...";

    try {
      const data = await verifyCode(code);

      if (!data.ok) {
        loginStatus.textContent = data.message || "登录失败";
        showToast(data.message || "登录失败", true);
        return;
      }

      const authState = {
        code,
        remaining: Number(data.remaining || 0),
        loginAt: nowMs()
      };

      await saveAuthState(authState);
      renderLoggedIn(authState);
      showToast(`登录成功，剩余次数：${authState.remaining}`);
    } catch (err) {
      loginStatus.textContent = "网络错误，请稍后重试";
      showToast("网络错误，请稍后重试", true);
    } finally {
      loginBtn.disabled = false;
      loginBtn.textContent = "登录";
    }
  }

  async function handleRefresh() {
    const auth = await loadAuthState();
    if (!auth || !auth.code) {
      await clearAuthState();
      renderLoggedOut("登录状态不存在，请重新登录");
      return;
    }

    refreshBtn.disabled = true;
    refreshBtn.textContent = "刷新中...";
    mainStatus.textContent = "正在刷新授权状态...";

    try {
      const data = await verifyCode(auth.code);

      if (!data.ok) {
        await clearAuthState();
        renderLoggedOut(data.message || "授权失效，请重新登录");
        showToast(data.message || "授权失效", true);
        return;
      }

      const newAuthState = {
        ...auth,
        remaining: Number(data.remaining || 0)
      };

      await saveAuthState(newAuthState);
      renderLoggedIn(newAuthState);
      showToast(`已刷新，剩余次数：${newAuthState.remaining}`);
    } catch (err) {
      mainStatus.textContent = "刷新失败，请检查网络";
      showToast("刷新失败，请检查网络", true);
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = "刷新授权状态";
    }
  }

  async function handleLogout() {
    await clearAuthState();
    renderLoggedOut("你已退出登录");
    showToast("已退出登录");
  }

  async function handleAppend() {
    appendBtn.disabled = true;
    appendBtn.textContent = "处理中...";
    appendStatus.textContent = "正在提取并筛选本页数据...";

    try {
      await persistFilters();
      const filters = await loadFilterState();

      const rawList = extractPeopleData();
      const passedList = filterPeopleData(rawList, filters);

      if (!passedList.length) {
        appendStatus.textContent = "当前页面没有符合条件的数据";
        showToast("当前页面没有符合条件的数据", true);
        return;
      }

      const mergeResult = await mergeIntoTotalTable(passedList);

      appendStatus.textContent =
        `本页识别 ${rawList.length} 条，符合条件 ${passedList.length} 条。\n` +
        `总表原有 ${mergeResult.oldCount} 条，现有 ${mergeResult.newCount} 条。`;

      showToast(
        `追加成功：本页识别 ${rawList.length} 条，合格 ${passedList.length} 条，总表现有 ${mergeResult.newCount} 条`
      );
    } catch (err) {
      appendStatus.textContent = "处理失败，请检查页面结构或稍后重试";
      showToast("处理失败，请检查页面结构或稍后重试", true);
    } finally {
      appendBtn.disabled = false;
      appendBtn.textContent = "追加本页到总表";
    }
  }

  async function handleCount() {
    const list = await loadDataList();
    appendStatus.textContent = `当前总表共有 ${list.length} 条数据`;
    showToast(`当前总表共有 ${list.length} 条数据`);
  }

  async function handleClear() {
    if (!confirm("确定要清空总表吗？")) return;
    await clearTotalTable();
    appendStatus.textContent = "总表已清空";
    showToast("总表已清空");
  }

  async function applyUiState() {
    const ui = await loadUiState();

    if (ui.hidden) {
      panel.style.display = "none";
      miniBtn.style.display = "block";
    } else {
      panel.style.display = "block";
      miniBtn.style.display = "none";
    }

    bodyEl.style.display = ui.minimized ? "none" : "block";
  }

  async function setMinimized(minimized) {
    const ui = await loadUiState();
    ui.minimized = minimized;
    await saveUiState(ui);
    bodyEl.style.display = minimized ? "none" : "block";
  }

  async function setHidden(hidden) {
    const ui = await loadUiState();
    ui.hidden = hidden;
    await saveUiState(ui);

    if (hidden) {
      panel.style.display = "none";
      miniBtn.style.display = "block";
    } else {
      panel.style.display = "block";
      miniBtn.style.display = "none";
    }
  }

  loginBtn.addEventListener("click", handleLogin);

  codeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleLogin();
  });

  refreshBtn.addEventListener("click", handleRefresh);
  logoutBtn.addEventListener("click", handleLogout);
  appendBtn.addEventListener("click", handleAppend);
  countBtn.addEventListener("click", handleCount);
  clearBtn.addEventListener("click", handleClear);

  minBtn.addEventListener("click", async () => {
    const minimized = bodyEl.style.display !== "none";
    await setMinimized(minimized);
  });

  hideBtn.addEventListener("click", async () => {
    await setHidden(true);
  });

  miniBtn.addEventListener("click", async () => {
    await setHidden(false);
  });

  (async () => {
    await applyUiState();
    await restoreFilters();
    await tryAutoLogin();
  })();
})();
