const DEFAULT_PRICES = Object.freeze({
  8: 3.3, 10: 3.4, 15: 3.9, 17: 4.2, 20: 4.5, 23: 4.8,
  24: 5, 25: 5.1, 27: 5.45, 28: 5.6, 30: 5.8, 32: 6.1,
  34: 6.35, 35: 6.5, 38: 6.95, 40: 7.2, 41: 7.35, 42: 7.5,
  43: 7.65, 44: 7.8, 45: 7.9, 46: 8.05, 47: 8.2, 48: 8.35,
  50: 8.7, 51: 8.85, 52: 9, 55: 9.5, 56: 9.65, 58: 9.95,
  59: 10.2, 60: 10.4, 65: 11.3, 70: 12.2, 75: 13.1, 80: 14.1
});

const STORAGE_KEY = "honeycomb-board-prices-v1";
const $ = (selector) => document.querySelector(selector);
const inputs = [$("#length"), $("#width"), $("#thickness"), $("#quantity")];
let prices = loadPrices();
let saveTimer;

function loadPrices() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || typeof saved !== "object") return { ...DEFAULT_PRICES };
    const complete = { ...DEFAULT_PRICES };
    Object.keys(complete).forEach((key) => {
      const value = Number(saved[key]);
      if (Number.isFinite(value) && value >= 0) complete[key] = value;
    });
    return complete;
  } catch {
    return { ...DEFAULT_PRICES };
  }
}

function renderPriceTable() {
  const body = $("#priceTableBody");
  body.innerHTML = "";
  Object.keys(prices).map(Number).sort((a, b) => a - b).forEach((thickness) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${thickness}mm</td>
      <td>
        <label class="sr-only" for="price-${thickness}">${thickness}毫米单价</label>
        <input class="price-input" id="price-${thickness}" type="number" min="0" step="0.01"
          inputmode="decimal" value="${prices[thickness]}" data-thickness="${thickness}">
      </td>`;
    body.appendChild(row);
  });

  body.querySelectorAll(".price-input").forEach((input) => {
    input.addEventListener("input", () => {
      const value = Number(input.value);
      if (Number.isFinite(value) && value >= 0) {
        prices[input.dataset.thickness] = value;
        scheduleSave();
        calculate();
      }
    });
  });
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
    const notice = $("#savedNotice");
    notice.textContent = "价格已保存到本机";
    setTimeout(() => { notice.textContent = ""; }, 1800);
  }, 250);
}

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
  $("#validResult").hidden = !isValid;
  $("#emptyResult").hidden = isValid;
  $("#validationMessage").textContent = message;
}

function calculate() {
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

  $("#totalPrice").textContent = money(totalPrice);
  $("#itemPrice").textContent = `¥${money(itemPrice)}`;
  $("#quantityText").textContent = quantity.toLocaleString("zh-CN");
  $("#areaValue").textContent = `${area.toFixed(5)} ㎡`;
  $("#rateValue").textContent = `¥${money(combinedRate)} /㎡`;
  $("#layerSummary").textContent = `共 ${combination.length} 层，合计 ${target} mm`;

  const layerList = $("#layerList");
  layerList.innerHTML = "";
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

  const rateFormula = combination.map((thickness) => Number(prices[thickness]).toFixed(5)).join(" + ");
  $("#calculationText").innerHTML = `
    ${compactNumber(length)}÷1000 × ${compactNumber(width)}÷1000 = ${area.toFixed(5)} ㎡<br>
    ${area.toFixed(5)} × (${rateFormula}) × ${quantity} = ¥${money(totalPrice)}`;
}

inputs.forEach((input) => input.addEventListener("input", calculate));

$("#printButton").addEventListener("click", () => window.print());

$("#resetPrices").addEventListener("click", () => {
  prices = { ...DEFAULT_PRICES };
  localStorage.removeItem(STORAGE_KEY);
  renderPriceTable();
  calculate();
  $("#savedNotice").textContent = "已恢复图片中的参考价格";
  setTimeout(() => { $("#savedNotice").textContent = ""; }, 1800);
});

$("#quoteDate").textContent = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric", month: "2-digit", day: "2-digit"
}).format(new Date());

renderPriceTable();
calculate();

const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
const isStandalone = window.navigator.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
if (isIOS && !isStandalone) $("#iosHint").hidden = false;

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {
      // 在线报价功能不依赖缓存；注册失败时保持正常联网使用。
    });
  });
}

