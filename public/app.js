const $ = (selector) => document.querySelector(selector);
const inputs = [$("#length"), $("#width"), $("#thickness"), $("#quantity")];
let prices;

function isBetterCombination(candidate, current) {
  if (!current) return true;
  if (candidate.length !== current.length) return candidate.length < current.length;
  for (let i = 0; i < candidate.length; i += 1) {
    if (candidate[i] !== current[i]) return candidate[i] > current[i];
  }
  return false;
}

function findCombination(target) {
  if (!Number.isInteger(target) || target < 1 || target > 5000) return null;
  const available = Object.keys(prices).map(Number).sort((a, b) => b - a);
  const best = Array(target + 1).fill(null);
  best[0] = [];

  for (let total = 1; total <= target; total += 1) {
    for (const thickness of available) {
      if (thickness > total || !best[total - thickness]) continue;
      const candidate = [...best[total - thickness], thickness].sort((a, b) => b - a);
      if (isBetterCombination(candidate, best[total])) best[total] = candidate;
    }
  }
  return best[target];
}

function findNearest(target, direction) {
  for (let offset = 1; offset <= 100; offset += 1) {
    const value = target + (direction * offset);
    if (value < 1 || value > 5000) continue;
    const combination = findCombination(value);
    if (combination) return { value, combination };
  }
  return null;
}

function money(value) {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 5, maximumFractionDigits: 5 });
}

function compactNumber(value, digits = 4) {
  return Number(value.toFixed(digits)).toString();
}

function setValidState(isValid, message = "") {
  $("#printButton").disabled = !isValid;
  $("#validResult").hidden = !isValid;
  $("#emptyResult").hidden = isValid;
  $("#validationMessage").textContent = message;
}

function calculate() {
  if (!prices) return;
  $("#resultMessage").textContent = "当前厚度无法精确拼接";
  const length = Number($("#length").value);
  const width = Number($("#width").value);
  const target = Number($("#thickness").value);
  const quantity = Number($("#quantity").value);

  inputs.forEach((input) => input.removeAttribute("aria-invalid"));

  if (![length, width, target, quantity].every(Number.isFinite) || length <= 0 || width <= 0 || target <= 0 || quantity <= 0) {
    inputs.forEach((input) => {
      if (!Number.isFinite(Number(input.value)) || Number(input.value) <= 0) input.setAttribute("aria-invalid", "true");
    });
    setValidState(false, "请填写大于 0 的完整订单数据。");
    $("#suggestionText").textContent = "修正输入后，系统将自动重新计算。";
    return;
  }

  if (!Number.isInteger(target) || target > 5000 || !Number.isInteger(quantity)) {
    if (!Number.isInteger(target) || target > 5000) $("#thickness").setAttribute("aria-invalid", "true");
    if (!Number.isInteger(quantity)) $("#quantity").setAttribute("aria-invalid", "true");
    setValidState(false, "厚度和数量请输入整数，厚度上限为 5000 mm。");
    $("#suggestionText").textContent = "修正输入后，系统将自动重新计算。";
    return;
  }

  const combination = findCombination(target);
  if (!combination) {
    setValidState(false);
    const lower = findNearest(target, -1);
    const upper = findNearest(target, 1);
    const suggestions = [];
    if (lower) suggestions.push(`向下可选 ${lower.value} mm（${lower.combination.join(" + ")}）`);
    if (upper) suggestions.push(`向上可选 ${upper.value} mm（${upper.combination.join(" + ")}）`);
    $("#suggestionText").textContent = suggestions.length
      ? `${target} mm 暂无精确组合。${suggestions.join("；")}。`
      : `${target} mm 暂无可用拼接方案。`;
    return;
  }

  setValidState(true);
  const area = (length / 1000) * (width / 1000);
  const combinedRate = combination.reduce((sum, thickness) => sum + Number(prices[thickness]), 0);
  const itemPrice = area * combinedRate;
  const totalPrice = itemPrice * quantity;

  const totalText = money(totalPrice);
  const total = $("#totalPrice");
  if (total.textContent !== totalText) {
    total.textContent = totalText;
    window.quoteMotion?.result(total);
  }
  $("#itemPrice").textContent = `¥${money(itemPrice)}`;
  $("#quantityText").textContent = quantity.toLocaleString("zh-CN");
  $("#areaValue").textContent = `${area.toFixed(5)} ㎡`;
  $("#rateValue").textContent = `¥${money(combinedRate)} /㎡`;
  $("#layerSummary").textContent = `共 ${combination.length} 层，合计 ${target} mm`;

  const layerList = $("#layerList");
  const signature = combination.map((thickness) => thickness + ":" + prices[thickness]).join(",");
  if (layerList.dataset.signature !== signature) {
    layerList.dataset.signature = signature;
    renderLayers(layerList, combination);
  }

  const rateFormula = combination.map((thickness) => Number(prices[thickness]).toFixed(5)).join(" + ");
  $("#calculationText").innerHTML = `
    ${compactNumber(length)}÷1000 × ${compactNumber(width)}÷1000 = ${area.toFixed(5)} ㎡<br>
    ${area.toFixed(5)} × (${rateFormula}) × ${quantity} = ¥${money(totalPrice)}`;
}

function renderLayers(layerList, combination) {
  layerList.replaceChildren();
  combination.forEach((thickness, index) => {
    if (index > 0) {
      const plus = document.createElement("span");
      plus.className = "layer-plus";
      plus.textContent = "+";
      layerList.appendChild(plus);
    }
    const chip = document.createElement("span");
    chip.className = "layer-chip";
    chip.textContent = `${thickness} mm · ¥${money(prices[thickness])}`;
    layerList.appendChild(chip);
  });
}

const priceTable = $("#priceTableBody");
const dialog = $("#adminDialog");
const adminForm = $("#adminForm");
const notice = $("#savedNotice");
const setupFromLink = new URLSearchParams(location.hash.slice(1)).get("setup");
if (setupFromLink) history.replaceState(null, "", location.pathname + location.search);

let revision;
let editing = false;
let configured = true;
let saving = false;

async function api(path, options) {
  const response = await fetch("/api/" + path, {
    ...options,
    headers: options?.body ? { "Content-Type": "application/json" } : undefined,
    cache: "no-store"
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.message || "服务暂时不可用，请稍后重试。");
    error.status = response.status;
    throw error;
  }
  return result;
}

function renderPriceTable() {
  if (!prices) return;
  const rows = Object.keys(prices).map(Number).sort((a, b) => a - b).map((thickness) => {
    const row = document.createElement("tr");
    const spec = document.createElement("th");
    spec.scope = "row";
    spec.textContent = thickness + " mm";
    const value = document.createElement("td");
    if (editing) {
      const input = document.createElement("input");
      input.className = "price-input";
      input.type = "number";
      input.min = "0";
      input.max = "1000000";
      input.step = "0.00001";
      input.required = true;
      input.inputMode = "decimal";
      input.dataset.thickness = thickness;
      input.value = prices[thickness];
      input.setAttribute("aria-label", thickness + " 毫米单价");
      value.append(input);
    } else {
      value.textContent = money(prices[thickness]);
    }
    row.append(spec, value);
    return row;
  });
  priceTable.replaceChildren(...rows);
}

function applyPrices(data) {
  revision = data.revision;
  prices = data.prices;
  renderPriceTable();
  calculate();
}

async function refreshPrices() {
  if (editing) return;
  try {
    const data = await api("prices");
    if (!editing && (revision === undefined || data.revision > revision)) applyPrices(data);
  } catch {
    if (prices) return;
    $("#resultMessage").textContent = "暂时无法读取报价表";
    $("#suggestionText").textContent = "请检查网络后刷新网页。";
    priceTable.rows[0].cells[0].textContent = "报价表暂时不可用";
  }
}

function setEditing(active) {
  editing = active;
  $("#adminButton").hidden = active;
  $("#cancelPrices").hidden = !active;
  $("#savePrices").hidden = !active;
  renderPriceTable();
}

async function openAdmin() {
  if (dialog.open) return;
  $("#adminButton").disabled = true;
  try {
    const session = await api("admin/session");
    configured = session.configured;
    if (session.admin) {
      await startEditing();
      return;
    }
    adminForm.reset();
    $("#adminError").textContent = "";
    $("#setupField").hidden = configured;
    $("#setupToken").required = !configured;
    $("#setupToken").value = configured ? "" : (setupFromLink || "");
    $("#adminPassword").autocomplete = configured ? "current-password" : "new-password";
    $("#adminPassword").minLength = configured ? 1 : 12;
    $("#adminPasswordLabel").textContent = configured ? "管理员密码" : "设置管理员密码";
    $("#adminHelp").textContent = configured ? "登录后可编辑并发布对外单价。" : "首次使用需要初始化密钥和至少 12 位的管理员密码。";
    $("#adminSubmit").textContent = configured ? "进入" : "设置并进入";
    dialog.showModal();
    (configured || setupFromLink ? $("#adminPassword") : $("#setupToken")).focus();
  } catch (error) {
    notice.textContent = error.message;
  } finally {
    $("#adminButton").disabled = false;
  }
}

async function startEditing() {
  applyPrices(await api("prices"));
  setEditing(true);
  notice.textContent = "正在编辑。发布后，客户刷新页面即可看到新价格。";
  priceTable.querySelector("input")?.focus();
}

async function leaveAdmin(message) {
  setEditing(false);
  $("#adminButton").disabled = true;
  notice.textContent = message;
  try {
    await api("admin/logout", { method: "POST" });
  } catch {
    notice.textContent += " 退出请求未完成，可关闭网页后重试。";
  } finally {
    $("#adminButton").disabled = false;
  }
}

$("#adminButton").addEventListener("click", openAdmin);
$("#closeAdmin").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => adminForm.reset());
adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = $("#adminSubmit");
  submit.disabled = true;
  $("#adminError").textContent = "";
  try {
    const payload = { password: $("#adminPassword").value };
    if (!configured) payload.setupToken = $("#setupToken").value;
    await api(configured ? "admin/login" : "admin/setup", {
      method: "POST", body: JSON.stringify(payload)
    });
    configured = true;
    dialog.close();
    await startEditing();
  } catch (error) {
    (dialog.open ? $("#adminError") : notice).textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

$("#cancelPrices").addEventListener("click", async () => {
  await leaveAdmin("已取消编辑。");
  await refreshPrices();
});

$("#savePrices").addEventListener("click", async () => {
  if (!editing || saving) return;
  const changes = {};
  for (const input of priceTable.querySelectorAll(".price-input")) {
    if (!input.reportValidity()) return;
    changes[input.dataset.thickness] = input.valueAsNumber;
  }
  saving = true;
  $("#savePrices").disabled = true;
  $("#cancelPrices").disabled = true;
  try {
    const data = await api("prices", {
      method: "PUT", body: JSON.stringify({ prices: changes, revision })
    });
    setEditing(false);
    applyPrices(data);
    await leaveAdmin("新价表已发布。");
  } catch (error) {
    notice.textContent = error.message;
    if (error.status === 401) setEditing(false);
  } finally {
    saving = false;
    $("#savePrices").disabled = false;
    $("#cancelPrices").disabled = false;
  }
});

inputs.forEach((input) => input.addEventListener("input", calculate));
$("#quoteForm").addEventListener("submit", (event) => event.preventDefault());
$("#printButton").addEventListener("click", () => window.print());
const calculationDetails = $(".calculation");
let calculationWasOpen;
window.addEventListener("beforeprint", () => {
  calculationWasOpen ??= calculationDetails.open;
  calculationDetails.open = true;
});
window.addEventListener("afterprint", () => {
  if (calculationWasOpen === undefined) return;
  calculationDetails.open = calculationWasOpen;
  calculationWasOpen = undefined;
});
$("#quoteDate").textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
if (isIOS && !navigator.standalone && !matchMedia("(display-mode: standalone)").matches) {
  $("#iosHint").hidden = false;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") refreshPrices();
});
refreshPrices();
if (setupFromLink) {
  const splash = $("#entrySplash");
  if (splash.open) splash.addEventListener("close", openAdmin, { once: true });
  else openAdmin();
}
