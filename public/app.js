const $ = (selector) => document.querySelector(selector);
const quoteForm = $("#quoteForm");
const orderInputs = [...quoteForm.querySelectorAll("input")];
const adminButton = $("#adminButton");
const dialog = $("#adminDialog");
const adminForm = $("#adminForm");
const markupForm = $("#markupForm");
const markupInput = $("#markupAmount");
const markupMode = $("#markupMode");
const markupPreview = $("#markupPreview");
const anchorInputs = Object.fromEntries([20, 70, 92].map(thickness => [thickness, $("#markup" + thickness)]));
const modeLabels = { fixed: "固定加价", size: "按尺寸加价" };
const adminStatus = $("#adminStatus");
const setupFromLink = new URLSearchParams(location.hash.slice(1)).get("setup");
if (setupFromLink) history.replaceState(null, "", location.pathname + location.search);

let quoteTimer;
let quoteRequest;
let setupMode = false;
let adminActive = false;
let adminBusy = false;
let markupRevision = 0;

async function api(path, options = {}) {
  const { body, ...request } = options;
  const response = await fetch("/api/" + path, {
    ...request,
    ...(body === undefined ? {} : {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json" }
    }),
    cache: "no-store"
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    const error = new Error(result?.message || "服务暂时不可用，请稍后重试。");
    error.status = response.status;
    error.code = result?.code;
    throw error;
  }
  return result;
}

function showQuoteMessage(title, detail = "", validation = "") {
  $("#validResult").hidden = true;
  $("#emptyResult").hidden = false;
  $("#printButton").disabled = true;
  $("#resultMessage").textContent = title;
  $("#suggestionText").textContent = detail;
  $("#validationMessage").textContent = validation;
}

function renderLayers(layers, thickness) {
  const list = $("#layerList");
  const signature = layers.join(",");
  if (list.dataset.signature !== signature) {
    const items = document.createDocumentFragment();
    for (const [index, size] of layers.entries()) {
      if (index > 0) {
        const plus = document.createElement("span");
        plus.className = "layer-plus";
        plus.textContent = "+";
        items.append(plus);
      }
      const chip = document.createElement("span");
      chip.className = "layer-chip";
      chip.textContent = size + " mm";
      items.append(chip);
    }
    list.replaceChildren(items);
    list.dataset.signature = signature;
  }
  $("#layerSummary").textContent = "共 " + layers.length + " 层，合计 " + thickness + " mm";
}

function renderQuote(quote, order) {
  const total = $("#totalPrice");
  const previous = total.textContent;
  total.textContent = quote.total;
  $("#quantityText").textContent = order.quantity.toLocaleString("zh-CN");
  renderLayers(quote.layers, order.thickness);
  $("#validResult").hidden = false;
  $("#emptyResult").hidden = true;
  $("#printButton").disabled = false;
  if (previous !== quote.total) window.quoteMotion?.result(total);
}

function readOrder() {
  const order = {};
  let valid = true;
  for (const input of orderInputs) {
    const value = input.valueAsNumber;
    let accepted = Number.isFinite(value) && value > 0;
    if (input.name === "thickness") accepted = Number.isInteger(value) && value >= 1 && value <= 5000;
    if (input.name === "quantity") accepted = Number.isSafeInteger(value) && value >= 1;
    if (accepted) input.removeAttribute("aria-invalid");
    else input.setAttribute("aria-invalid", "true");
    valid = valid && accepted;
    order[input.name] = value;
  }
  return valid ? order : null;
}

function requestQuote(delay = 180) {
  clearTimeout(quoteTimer);
  quoteRequest?.abort();
  const order = readOrder();
  if (!order) {
    showQuoteMessage("请检查规格或数量", "", "长宽须大于 0。厚度须为 1 至 5000 mm 的整数，数量须为正整数。");
    return;
  }
  showQuoteMessage("正在计算报价");
  quoteTimer = setTimeout(async () => {
    const controller = new AbortController();
    quoteRequest = controller;
    try {
      const quote = await api("quote", { method: "POST", body: order, signal: controller.signal });
      if (!controller.signal.aborted) renderQuote(quote, order);
    } catch (error) {
      if (!controller.signal.aborted) {
        const title = error.code === "manual_quote" ? "需人工核价"
          : error.status === 422 ? "当前厚度无法精确拼接" : "暂时无法报价";
        showQuoteMessage(title, error.message);
      }
    } finally {
      if (quoteRequest === controller) quoteRequest = null;
    }
  }, delay);
}

function setAdminStatus(message = "", error = false) {
  adminStatus.textContent = message;
  adminStatus.dataset.state = error ? "error" : "success";
}

function setAdminBusy(busy) {
  adminBusy = busy;
  for (const id of ["#adminSubmit", "#saveMarkup", "#previewMarkup", "#closeAdmin", "#exitAdmin"]) {
    $(id).disabled = busy;
  }
  for (const input of [markupInput, markupMode, ...Object.values(anchorInputs)]) input.disabled = busy;
}

function configureLogin(configured) {
  adminActive = false;
  setupMode = !configured;
  adminForm.reset();
  markupForm.reset();
  markupPreview.hidden = true;
  adminForm.hidden = false;
  markupForm.hidden = true;
  $("#setupField").hidden = configured;
  $("#setupToken").required = !configured;
  $("#setupToken").value = configured ? "" : (setupFromLink || "");
  $("#adminPassword").autocomplete = configured ? "current-password" : "new-password";
  $("#adminPassword").minLength = configured ? 1 : 12;
  $("#adminPasswordLabel").textContent = configured ? "管理员密码" : "设置管理员密码";
  $("#adminHelp").textContent = configured ? "请输入管理员密码。"
    : "首次使用需要初始化密钥和至少 12 位的管理员密码。";
  $("#adminSubmit").textContent = configured ? "进入" : "设置并进入";
}

function applyMarkup(markup) {
  markupRevision = markup.revision;
  markupInput.value = String(markup.amount);
  markupMode.value = markup.mode;
  for (const [thickness, input] of Object.entries(anchorInputs)) input.value = String(markup.anchors[thickness]);
  $("#activeMarkupMode").textContent = "当前生效：" + modeLabels[markup.mode];
  markupPreview.hidden = true;
  adminForm.hidden = true;
  markupForm.hidden = false;
}

function markupDraft() {
  return {
    mode: markupMode.value,
    amount: markupInput.valueAsNumber,
    anchors: Object.fromEntries(Object.entries(anchorInputs).map(([thickness, input]) => [thickness, input.valueAsNumber]))
  };
}

async function openAdmin() {
  if (dialog.open || adminButton.disabled) return;
  adminButton.disabled = true;
  $("#adminNotice").textContent = "";
  setAdminStatus();
  try {
    const session = await api("admin/session");
    adminActive = session.admin;
    if (session.admin) applyMarkup(await api("admin/markup"));
    else configureLogin(session.configured);
    dialog.showModal();
    if (adminActive) markupMode.focus();
    else (setupMode && !setupFromLink ? $("#setupToken") : $("#adminPassword")).focus();
  } catch (error) {
    $("#adminNotice").textContent = error.message;
  } finally {
    adminButton.disabled = false;
  }
}

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (adminBusy) return;
  setAdminBusy(true);
  setAdminStatus();
  try {
    const body = { password: $("#adminPassword").value };
    if (setupMode) body.setupToken = $("#setupToken").value;
    await api(setupMode ? "admin/setup" : "admin/login", { method: "POST", body });
    adminActive = true;
    const markup = await api("admin/markup");
    adminForm.reset();
    applyMarkup(markup);
  } catch (error) {
    setAdminStatus(error.message, true);
  } finally {
    setAdminBusy(false);
    if (!markupForm.hidden) markupMode.focus();
  }
});

markupForm.addEventListener("input", () => {
  markupPreview.hidden = true;
  setAdminStatus();
});

$("#previewMarkup").addEventListener("click", async () => {
  if (adminBusy || !adminActive || !markupForm.reportValidity()) return;
  const order = readOrder();
  if (!order) {
    setAdminStatus("请先返回报价页填写有效的长、宽、厚和数量。", true);
    return;
  }
  setAdminBusy(true);
  setAdminStatus();
  markupPreview.hidden = true;
  try {
    const result = await api("admin/markup/preview", { method: "POST", body: { order, pricing: markupDraft() } });
    $("#previewSpec").textContent = `${order.length} × ${order.width} × ${order.thickness} mm · ${order.quantity.toLocaleString("zh-CN")} 件`;
    for (const [target, data] of [["#previewFixed", result.fixed], ["#previewSize", result.size]]) {
      $(target).textContent = data.message || `总价 ¥${data.total} · 加价 ${data.amount.toFixed(5)} 元/件`;
    }
    markupPreview.hidden = false;
    markupPreview.scrollIntoView({ block: "nearest" });
  } catch (error) {
    if (error.status === 401) configureLogin(true);
    setAdminStatus(error.message, true);
  } finally {
    setAdminBusy(false);
  }
});

markupForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (adminBusy || !adminActive) return;
  setAdminBusy(true);
  setAdminStatus();
  try {
    applyMarkup(await api("admin/markup", {
      method: "PUT",
      body: { ...markupDraft(), revision: markupRevision }
    }));
    setAdminStatus("已保存客户报价设置。");
    requestQuote(0);
  } catch (error) {
    let message = error.message;
    if (error.status === 409) {
      try {
        applyMarkup(await api("admin/markup"));
        message = "计价设置已被更新。请核对最新设置后再保存。";
      } catch (refreshError) {
        if (refreshError.status === 401) configureLogin(true);
        message = refreshError.message;
      }
    } else if (error.status === 401) {
      configureLogin(true);
      message = "登录已过期，请重新登录。";
    }
    setAdminStatus(message, true);
  } finally {
    setAdminBusy(false);
  }
});

adminButton.addEventListener("click", openAdmin);
$("#closeAdmin").addEventListener("click", () => dialog.close());
$("#exitAdmin").addEventListener("click", () => dialog.close());
dialog.addEventListener("cancel", (event) => {
  if (adminBusy) event.preventDefault();
});
dialog.addEventListener("close", async () => {
  adminForm.reset();
  markupForm.reset();
  markupForm.hidden = true;
  markupPreview.hidden = true;
  setAdminStatus();
  if (!adminActive) return;
  adminActive = false;
  adminButton.disabled = true;
  try {
    await api("admin/logout", { method: "POST" });
  } catch (error) {
    $("#adminNotice").textContent = error.message;
  } finally {
    adminButton.disabled = false;
  }
});

quoteForm.addEventListener("input", () => requestQuote());
quoteForm.addEventListener("submit", (event) => {
  event.preventDefault();
  requestQuote(0);
});
$("#printButton").addEventListener("click", () => window.print());
$("#quoteDate").textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isIOS && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches) {
  $("#iosHint").hidden = false;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestQuote(0);
});
requestQuote(0);
if (setupFromLink) {
  const splash = $("#entrySplash");
  if (splash.open) splash.addEventListener("close", openAdmin, { once: true });
  else openAdmin();
}
