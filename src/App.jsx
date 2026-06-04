import { useEffect, useMemo, useState } from "react";
import Tesseract from "tesseract.js";

const STORAGE_DB_NAME = "hoje-kcal-db";
const STORAGE_VERSION = 1;
const SETTINGS_STORE = "settings";
const FOODS_STORE = "foods";
const ENTRIES_STORE = "entries";
const SEED_KEY = "seeded";

const mealLabels = {
  breakfast: "Cafe da manha",
  lunch: "Almoco",
  snacks: "Lanches",
  dinner: "Jantar",
};

const mealMeta = {
  breakfast: { icon: "sun", time: "07:30", accent: "lime" },
  lunch: { icon: "half", time: "12:45", accent: "sand" },
  snacks: { icon: "bolt", time: "16:30", accent: "coral" },
  dinner: { icon: "moon", time: "19:30", accent: "lime" },
};

const defaultSettings = {
  dailyCalorieGoal: 2400,
  macroTargets: {
    protein: 160,
    carbs: 300,
    fat: 80,
    fiber: 30,
  },
  ai: {
    provider: "google-gemini",
    model: "gemini-flash-latest",
    apiKey: "",
  },
  locale: "pt-BR",
  units: "metric",
};

const seedFoods = [
  {
    id: "seed-ovo",
    name: "Ovo cozido",
    brand: "",
    defaultServingLabel: "1 unidade",
    defaultServingGrams: 50,
    calories: 78,
    protein: 6,
    carbs: 0.6,
    fat: 5,
    fiber: 0,
    isFavorite: true,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-frango",
    name: "Peito de frango grelhado",
    brand: "",
    defaultServingLabel: "100 g",
    defaultServingGrams: 100,
    calories: 165,
    protein: 31,
    carbs: 0,
    fat: 3.6,
    fiber: 0,
    isFavorite: true,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-banana",
    name: "Banana prata",
    brand: "",
    defaultServingLabel: "1 unidade",
    defaultServingGrams: 86,
    calories: 105,
    protein: 1.3,
    carbs: 27,
    fat: 0.3,
    fiber: 3,
    isFavorite: true,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-iogurte",
    name: "Iogurte natural",
    brand: "",
    defaultServingLabel: "170 g",
    defaultServingGrams: 170,
    calories: 100,
    protein: 9,
    carbs: 12,
    fat: 2.5,
    fiber: 0,
    isFavorite: false,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-arroz",
    name: "Arroz branco cozido",
    brand: "",
    defaultServingLabel: "100 g",
    defaultServingGrams: 100,
    calories: 130,
    protein: 2.7,
    carbs: 28,
    fat: 0.3,
    fiber: 1.6,
    isFavorite: false,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-feijao",
    name: "Feijao preto cozido",
    brand: "",
    defaultServingLabel: "100 g",
    defaultServingGrams: 100,
    calories: 77,
    protein: 4.5,
    carbs: 14,
    fat: 0.5,
    fiber: 8,
    isFavorite: false,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
  {
    id: "seed-whey",
    name: "Whey protein",
    brand: "Growth",
    defaultServingLabel: "30 g",
    defaultServingGrams: 30,
    calories: 120,
    protein: 24,
    carbs: 3,
    fat: 2,
    fiber: 0,
    isFavorite: false,
    createdAt: "2026-06-03T10:00:00.000Z",
    updatedAt: "2026-06-03T10:00:00.000Z",
  },
];

const quickAddIds = ["seed-ovo", "seed-frango", "seed-banana", "seed-iogurte"];

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function numberFromOcr(value) {
  const match = String(value || "").match(/\d+(?:[,.]\d+)?/);
  if (!match) {
    return "";
  }
  return match[0].replace(",", ".");
}

function extractOcrNumbers(value) {
  return Array.from(String(value || "").matchAll(/\d+(?:[,.]\d+)?/g)).map((match) => ({
    raw: match[0],
    value: Number(match[0].replace(",", ".")),
    index: match.index || 0,
  })).filter((item) => Number.isFinite(item.value));
}

function normalizedServingUnit(unit) {
  return String(unit || "")
    .toLowerCase()
    .replace("gramas", "g")
    .replace("mililitros", "ml")
    .replace(/unidades?|unid\.?/, "unidade");
}

function nutritionLabelLines(text) {
  return String(text || "")
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractServingFromLine(line) {
  const servingMatch = String(line || "").match(/(\d+(?:[,.]\d+)?)\s*(g|gramas|ml|mililitros|unidades?|unid\.?|fatias?)/i);
  if (!servingMatch) {
    return null;
  }

  return {
    amount: Number(servingMatch[1].replace(",", ".")),
    unit: normalizedServingUnit(servingMatch[2]),
    raw: `${servingMatch[1].replace(",", ".")} ${normalizedServingUnit(servingMatch[2])}`,
  };
}

function extractQuantityColumns(text) {
  const columns = [];
  const ignoredNormalizedLines = ["porcoes por embalagem", "porcoes", "percentual", "valores diarios"];

  nutritionLabelLines(text).forEach((line) => {
    const normalizedLine = normalizeText(line);
    if (ignoredNormalizedLines.some((ignored) => normalizedLine.includes(ignored))) {
      return;
    }

    Array.from(line.matchAll(/(\d+(?:[,.]\d+)?)\s*(g|gramas|ml|mililitros)(?![a-z])/gi)).forEach((match) => {
      const amount = Number(match[1].replace(",", "."));
      if (!Number.isFinite(amount) || amount <= 0) {
        return;
      }

      columns.push({
        amount,
        unit: normalizedServingUnit(match[2]),
        label: `${match[1].replace(",", ".")} ${normalizedServingUnit(match[2])}`,
        line,
        index: match.index || 0,
      });
    });
  });

  const uniqueColumns = columns.filter((column, index, list) =>
    list.findIndex((item) => item.amount === column.amount && item.unit === column.unit) === index
  );

  return uniqueColumns.sort((left, right) => left.index - right.index);
}

function getBaseServingColumn(text) {
  const servingLine = nutritionLabelLines(text).find((line) => {
    const normalized = normalizeText(line);
    return normalized.includes("porcao") || normalized.includes("serving");
  });
  const serving = extractServingFromLine(servingLine);
  const columns = extractQuantityColumns(text);

  if (columns.length) {
    const smallerColumn = columns.reduce((selected, column) => {
      if (!selected) {
        return column;
      }

      return column.amount < selected.amount ? column : selected;
    }, null);
    const columnIndex = columns.findIndex((column) => column === smallerColumn);

    return {
      serving: smallerColumn,
      columnIndex: Math.max(0, columnIndex),
      columns,
    };
  }

  if (serving) {
    return { serving, columnIndex: 0, columns: [serving] };
  }

  return { serving: { amount: 100, unit: "g", raw: "100 g" }, columnIndex: 0, columns: [] };
}

function valueFromNutritionLine(line, columnIndex) {
  const numbers = extractOcrNumbers(line);
  if (!numbers.length) {
    return "";
  }

  const hasDailyValueColumn = /%\s*v\s*d|vd\*?|daily value/i.test(line) || numbers.length >= 3;
  const nutrientColumnCount = hasDailyValueColumn ? numbers.length - 1 : numbers.length;
  const boundedColumnIndex = Math.min(Math.max(columnIndex, 0), Math.max(nutrientColumnCount - 1, 0));
  const selectedNumber = numbers[boundedColumnIndex] || numbers[numbers.length - 1];

  return selectedNumber.raw.replace(",", ".");
}

function extractLineValue(text, labels, columnIndex = 0) {
  const lines = nutritionLabelLines(text);
  const normalizedLabels = labels.map(normalizeText);

  for (const line of lines) {
    const normalizedLine = normalizeText(line);
    if (normalizedLabels.some((label) => normalizedLine.includes(label))) {
      const value = valueFromNutritionLine(line, columnIndex);
      if (value !== "") {
        return value;
      }
    }
  }

  return "";
}

function extractServingLabel(text) {
  return getBaseServingColumn(text).serving.raw || "100 g";
}

function parseNutritionOcrText(text) {
  const { columnIndex } = getBaseServingColumn(text);
  const parsed = {
    defaultServingLabel: extractServingLabel(text),
    calories: extractLineValue(text, ["valor energetico", "calorias", "kcal", "energy"], columnIndex),
    protein: extractLineValue(text, ["proteina", "proteinas", "protein"], columnIndex),
    carbs: extractLineValue(text, ["carboidrato", "carboidratos", "carbohydrate", "carbohydrates"], columnIndex),
    fat: extractLineValue(text, ["gorduras totais", "gordura total", "total fat", "fat"], columnIndex),
    fiber: extractLineValue(text, ["fibra alimentar", "fibras alimentares", "fibra", "fiber"], columnIndex),
  };

  return parsed;
}

function mergeOcrDraft(current, parsed) {
  return Object.fromEntries(Object.entries(parsed).map(([key, value]) => [key, value || current[key]]));
}

function mergeSettings(settings) {
  return {
    ...defaultSettings,
    ...settings,
    macroTargets: {
      ...defaultSettings.macroTargets,
      ...(settings?.macroTargets || {}),
    },
    ai: {
      ...defaultSettings.ai,
      ...(settings?.ai || {}),
    },
  };
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(STORAGE_DB_NAME, STORAGE_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }

      if (!db.objectStoreNames.contains(FOODS_STORE)) {
        db.createObjectStore(FOODS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(ENTRIES_STORE)) {
        db.createObjectStore(ENTRIES_STORE, { keyPath: "id" });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readonly");
    const store = transaction.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putItem(storeName, value) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.put(value);
    request.onsuccess = () => resolve(value);
    request.onerror = () => reject(request.error);
  });
}

async function putMany(storeName, values) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    values.forEach((value) => {
      store.put(value);
    });
    transaction.oncomplete = () => resolve(values);
    transaction.onerror = () => reject(transaction.error);
  });
}

async function deleteItem(storeName, key) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

async function clearStore(storeName) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, "readwrite");
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

function csvEscape(value) {
  const stringValue = value == null ? "" : String(value);
  if (/[",\n\r;]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function csvRow(values) {
  return values.map(csvEscape).join(";");
}

function parseCsvLine(line) {
  const cells = [];
  let current = "";
  let insideQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"' && insideQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if ((char === ";" || char === ",") && !insideQuotes) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }

  cells.push(current);
  return cells;
}

function parseCsv(text) {
  const lines = String(text || "").replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return [];
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function backupRows({ foods, entries, settings }) {
  const preferences = { key: "preferences", value: settings };
  const seeded = { key: SEED_KEY, value: true };

  return [
    ...[preferences, seeded].map((item) => ({ type: "setting", payload: JSON.stringify(item) })),
    ...foods.map((food) => ({ type: "food", payload: JSON.stringify(food) })),
    ...entries.map((entry) => ({ type: "entry", payload: JSON.stringify(entry) })),
  ];
}

function buildBackupCsv(data) {
  return [
    csvRow(["type", "payload"]),
    ...backupRows(data).map((row) => csvRow([row.type, row.payload])),
  ].join("\n");
}

function parseBackupCsv(text) {
  const rows = parseCsv(text);
  const next = { settings: mergeSettings(defaultSettings), foods: [], entries: [], settingsRecords: [] };

  rows.forEach((row) => {
    const type = row.type;
    const payload = JSON.parse(row.payload || "{}");

    if (type === "setting") {
      next.settingsRecords.push(payload);
      if (payload.key === "preferences" && payload.value) {
        next.settings = mergeSettings(payload.value);
      }
    }

    if (type === "food") {
      next.foods.push(payload);
    }

    if (type === "entry") {
      next.entries.push(payload);
    }
  });

  return next;
}

function padDatePart(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}-${padDatePart(date.getDate())}`;
}

function todayKey() {
  return dateKey(new Date());
}

function numberFormat(value) {
  return new Intl.NumberFormat("pt-BR").format(Math.round(value));
}

function decimalFormat(value) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function parseLocalizedNumber(value) {
  const normalizedValue = String(value ?? "")
    .trim()
    .replace(",", ".");
  const parsedValue = Number(normalizedValue || 0);
  return Number.isFinite(parsedValue) ? parsedValue : 0;
}

function jsonFromAiText(text) {
  const cleaned = String(text || "")
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("A IA nao retornou um JSON valido.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}

function aiProviderLabel(provider) {
  const labels = {
    "google-gemini": "Google Gemini",
  };
  return labels[provider] || provider || "IA";
}

async function generateAiText(settings, prompt) {
  const ai = mergeSettings(settings).ai;
  const provider = ai.provider || "google-gemini";
  const apiKey = String(ai.apiKey || "").trim();
  const model = String(ai.model || "gemini-flash-latest").trim();

  if (!apiKey) {
    throw new Error("Preencha a chave de API da IA no Perfil antes de usar o assistente.");
  }

  if (provider !== "google-gemini") {
    throw new Error(`Provedor ${provider} ainda nao implementado.`);
  }

  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }],
        },
      ],
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || "Nao foi possivel consultar a IA.");
  }

  const text = data?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n").trim();
  if (!text) {
    throw new Error("A IA nao retornou uma resposta.");
  }

  return text;
}

function normalizeAiFoodDraft(food) {
  const numberValue = (value) => {
    const parsed = Number(String(value ?? "").replace(",", "."));
    return Number.isFinite(parsed) ? String(parsed).replace(".", ",") : "";
  };

  return {
    name: String(food?.name || ""),
    brand: String(food?.brand || ""),
    defaultServingLabel: String(food?.defaultServingLabel || food?.servingLabel || ""),
    calories: numberValue(food?.calories),
    protein: numberValue(food?.protein),
    carbs: numberValue(food?.carbs),
    fat: numberValue(food?.fat),
    fiber: numberValue(food?.fiber),
  };
}

function buildFoodAiPrompt(description) {
  return `Voce e um assistente de cadastro de alimentos para um diario alimentar em portugues do Brasil.
Extraia ou estime os atributos nutricionais do alimento descrito pelo usuario.
Responda APENAS com JSON valido, sem markdown, no formato:
{
  "name": "Nome do alimento ou preparacao",
  "brand": "Marca quando informada ou vazio",
  "defaultServingLabel": "Porcao base, ex.: 100 g, 1 unidade, 1 prato",
  "defaultServingGrams": 100,
  "calories": 0,
  "protein": 0,
  "carbs": 0,
  "fat": 0,
  "fiber": 0,
  "confidence": "low|medium|high",
  "notes": "curta observacao sobre estimativas"
}
Use numeros por porcao base. Se algo for incerto, estime com prudencia e marque confidence baixo ou medio.

Descricao do usuario: ${description}`;
}

function buildProfileAiContext({ settings, entries, foods, totals, history }) {
  const today = todayKey();
  const last30Keys = new Set(Array.from({ length: 30 }).map((_, index) => startOfDayOffset(index)));
  const recentEntries = entries.filter((entry) => last30Keys.has(entry.date));
  const byDate = Array.from(last30Keys).sort().map((date) => {
    const dayEntries = recentEntries.filter((entry) => entry.date === date);
    return {
      date,
      entries: dayEntries.length,
      totals: sumNutrition(dayEntries),
    };
  });
  const foodCounts = recentEntries.reduce((acc, entry) => {
    const name = entry.foodNameSnapshot || foods.find((food) => food.id === entry.foodItemId)?.name || "Alimento";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  const mealPatterns = Object.keys(mealLabels).map((mealType) => {
    const mealEntries = recentEntries.filter((entry) => entry.mealType === mealType);
    const trackedDays = new Set(mealEntries.map((entry) => entry.date)).size || 1;
    return {
      mealType,
      label: mealLabels[mealType],
      entries: mealEntries.length,
      averageCaloriesWhenTracked: Math.round(sumNutrition(mealEntries).calories / trackedDays),
    };
  });

  return {
    period: "ultimos 30 dias",
    today,
    profile: {
      dailyCalorieGoal: settings.dailyCalorieGoal,
      macroTargets: settings.macroTargets,
    },
    todayTotals: totals,
    recentHistory: history,
    dailyTotals: byDate,
    topFoods: Object.entries(foodCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((left, right) => right.count - left.count)
      .slice(0, 10),
    mealPatterns,
  };
}

function buildProfileAiPrompt(context, question) {
  return `Voce e um assistente analitico de diario alimentar. Responda em portugues do Brasil, com tom direto e pratico.
Use somente os dados fornecidos no JSON de contexto. Se nao houver dado suficiente, diga isso claramente.
Nao faca diagnosticos medicos, prescricoes clinicas ou promessas de saude. Foque em padroes alimentares, metas, calorias e macros.

Contexto do app:
${JSON.stringify(context, null, 2)}

Pergunta do usuario: ${question}`;
}

function speechRecognitionConstructor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function speechNumberToken(value) {
  const tokens = {
    zero: "0",
    um: "1",
    uma: "1",
    dois: "2",
    duas: "2",
    tres: "3",
    três: "3",
    quatro: "4",
    cinco: "5",
    seis: "6",
    sete: "7",
    oito: "8",
    nove: "9",
    dez: "10",
  };

  return tokens[normalizeText(value)] || "";
}

function numberFromSpeech(value) {
  const spoken = String(value || "").trim().toLowerCase();
  const numericMatch = spoken.match(/\d+(?:[,.]\d+)?/);

  if (numericMatch) {
    return numericMatch[0].replace(".", ",");
  }

  const parts = spoken.split(/\s+/);
  const decimalIndex = parts.findIndex((part) => ["virgula", "vírgula", "ponto"].includes(part));

  if (decimalIndex >= 0) {
    const integerToken = speechNumberToken(parts[decimalIndex - 1]) || "0";
    const decimalTokens = parts.slice(decimalIndex + 1).map(speechNumberToken).filter(Boolean);

    if (decimalTokens.length) {
      return `${integerToken},${decimalTokens.join("")}`;
    }
  }

  return speechNumberToken(parts[0]) || spoken;
}

function startOfDayOffset(offset) {
  const now = new Date();
  now.setDate(now.getDate() - offset);
  return dateKey(now);
}

function macroPct(current, target) {
  if (!target) {
    return 0;
  }
  return Math.min(100, Math.round((current / target) * 100));
}

function sumNutrition(entries) {
  return entries.reduce(
    (acc, entry) => {
      acc.calories += entry.nutritionSnapshot.calories;
      acc.protein += entry.nutritionSnapshot.protein;
      acc.carbs += entry.nutritionSnapshot.carbs;
      acc.fat += entry.nutritionSnapshot.fat;
      acc.fiber += entry.nutritionSnapshot.fiber || 0;
      return acc;
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
  );
}

function nutritionFromProduct(product) {
  const nutriments = product?.nutriments || {};
  const servingGrams = Number.parseFloat(product?.serving_quantity) || 100;
  const factor = servingGrams / 100;

  const valueForServing = (key) => {
    const servingValue = Number.parseFloat(nutriments[`${key}_serving`]);
    if (Number.isFinite(servingValue)) {
      return servingValue;
    }

    const per100gValue = Number.parseFloat(nutriments[`${key}_100g`]);
    if (Number.isFinite(per100gValue)) {
      return per100gValue * factor;
    }

    return 0;
  };

  return {
    servingGrams,
    calories: Math.round(valueForServing("energy-kcal")),
    protein: Number(valueForServing("proteins").toFixed(1)),
    carbs: Number(valueForServing("carbohydrates").toFixed(1)),
    fat: Number(valueForServing("fat").toFixed(1)),
    fiber: Number(valueForServing("fiber").toFixed(1)),
  };
}

function productToFood(product, barcode) {
  const nutrition = nutritionFromProduct(product);
  const now = new Date().toISOString();
  const name = product?.product_name_pt || product?.product_name || product?.generic_name_pt || product?.generic_name;
  const servingLabel = product?.serving_size || `${nutrition.servingGrams || 100} g`;

  return {
    id: `barcode-${barcode}`,
    barcode,
    name: name || `Produto ${barcode}`,
    brand: product?.brands?.split(",")?.[0]?.trim() || "Open Food Facts",
    defaultServingLabel: servingLabel,
    defaultServingGrams: nutrition.servingGrams || null,
    calories: nutrition.calories,
    protein: nutrition.protein,
    carbs: nutrition.carbs,
    fat: nutrition.fat,
    fiber: nutrition.fiber,
    isFavorite: false,
    createdAt: now,
    updatedAt: now,
  };
}

async function fetchFoodByBarcode(barcode) {
  const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${barcode}.json?fields=code,status,product_name,product_name_pt,generic_name,generic_name_pt,brands,serving_size,serving_quantity,nutriments`);
  if (!response.ok) {
    throw new Error("Nao foi possivel consultar o codigo de barras.");
  }

  const data = await response.json();
  if (data.status !== 1 || !data.product) {
    throw new Error("Produto nao encontrado na Open Food Facts.");
  }

  return productToFood(data.product, barcode);
}

function monthKey(date) {
  return `${date.getFullYear()}-${padDatePart(date.getMonth() + 1)}`;
}

function monthLabel(date) {
  return date.toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
}

function buildMonthDays(activeMonth, entries) {
  const year = activeMonth.getFullYear();
  const month = activeMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const offset = firstDay.getDay();
  const days = [];

  for (let index = 0; index < offset; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day, 12);
    const key = dateKey(date);
    const dayEntries = entries.filter((entry) => entry.date === key);
    days.push({
      key,
      day,
      total: sumNutrition(dayEntries).calories,
      entries: dayEntries.length,
    });
  }

  return days;
}

function buildHistory(entries) {
  const days = Array.from({ length: 6 }).map((_, index) => {
    const date = startOfDayOffset(5 - index);
    const dayEntries = entries.filter((entry) => entry.date === date);
    const total = sumNutrition(dayEntries).calories;
    const dateObj = new Date(`${date}T12:00:00`);
    return {
      date,
      label: dateObj
        .toLocaleDateString("pt-BR", { weekday: "short" })
        .replace(".", "")
        .toUpperCase(),
      day: dateObj.toLocaleDateString("pt-BR", { day: "2-digit" }),
      total,
    };
  });
  return days;
}

function createEntry(food, mealType, multiplier) {
  const ratio = Number(multiplier);
  const amount = Number.isFinite(ratio) && ratio > 0 ? ratio : 1;
  return {
    id: crypto.randomUUID(),
    date: todayKey(),
    mealType,
    foodItemId: food.id,
    servingMultiplier: amount,
    servingLabelSnapshot: food.defaultServingLabel,
    foodNameSnapshot: food.name,
    nutritionSnapshot: {
      calories: Math.round(food.calories * amount),
      protein: Number((food.protein * amount).toFixed(1)),
      carbs: Number((food.carbs * amount).toFixed(1)),
      fat: Number((food.fat * amount).toFixed(1)),
      fiber: Number(((food.fiber || 0) * amount).toFixed(1)),
    },
    createdAt: new Date().toISOString(),
  };
}

function Icon({ name }) {
  const common = { stroke: "currentColor", strokeWidth: "1.8", fill: "none", strokeLinecap: "round", strokeLinejoin: "round" };

  if (name === "target") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="7" {...common} />
        <circle cx="12" cy="12" r="2.5" {...common} />
        <path d="M12 5V3M19 12h2M12 19v2M3 12H5" {...common} />
      </svg>
    );
  }
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" {...common} />
        <path d="m16 16 4.5 4.5" {...common} />
      </svg>
    );
  }
  if (name === "star") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.7 5.6 6.3.9-4.5 4.4 1.1 6.3L12 17.3 6.4 20.2l1.1-6.3L3 9.5l6.3-.9L12 3Z" {...common} />
      </svg>
    );
  }
  if (name === "user") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="8" r="3.6" {...common} />
        <path d="M5 20c1.6-3 4-4.5 7-4.5S17.4 17 19 20" {...common} />
      </svg>
    );
  }
  if (name === "plus") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 5v14M5 12h14" {...common} />
      </svg>
    );
  }
  if (name === "bolt") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13.5 2 6 13h5l-1 9 8-12h-5l.5-8Z" {...common} />
      </svg>
    );
  }
  if (name === "moon") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M15.5 3.5a8 8 0 1 0 5 14.3A8.6 8.6 0 0 1 15.5 3.5Z" {...common} />
      </svg>
    );
  }
  if (name === "sun") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" {...common} />
        <path d="M12 1.8v3M12 19.2v3M22.2 12h-3M4.8 12h-3M19.2 4.8l-2.1 2.1M6.9 17.1l-2.1 2.1M19.2 19.2l-2.1-2.1M6.9 6.9 4.8 4.8" {...common} />
      </svg>
    );
  }
  if (name === "half") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 15a8 8 0 0 1 16 0" {...common} />
        <path d="M6 15h12" {...common} />
        <path d="M12 7v8" {...common} />
      </svg>
    );
  }
  if (name === "barcode") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5v14M7 5v14M10 5v14M14 5v14M17 5v14M20 5v14" {...common} />
      </svg>
    );
  }
  if (name === "camera") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 8h3l1.6-2h4.8L16 8h3a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" {...common} />
        <circle cx="12" cy="14" r="3.2" {...common} />
      </svg>
    );
  }
  if (name === "pencil") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m4 20 4.3-1 10-10a2 2 0 0 0-2.8-2.8l-10 10L4 20Z" {...common} />
        <path d="m13.5 6.5 4 4" {...common} />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="15" rx="2" {...common} />
        <path d="M8 3v4M16 3v4M4 10h16" {...common} />
        <path d="M8 14h.1M12 14h.1M16 14h.1M8 17h.1M12 17h.1" {...common} />
      </svg>
    );
  }
  return null;
}

function AppHeader({ settings, totals, percent }) {
  const remaining = Math.max(0, settings.dailyCalorieGoal - totals.calories);
  return (
    <section className="hero-panel">
      <div className="hero-topline">
        <p>{new Date().toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }).toUpperCase()}</p>
        <div className="goal-chip">
          <Icon name="target" />
          <div>
            <span>Meta</span>
            <strong>{numberFormat(settings.dailyCalorieGoal)}</strong>
            <small>kcal</small>
          </div>
        </div>
      </div>

      <div className="hero-title">HOJE</div>

      <div className="score-grid">
        <div>
          <span className="score-label">Consumidas</span>
          <strong className="score-value">{numberFormat(totals.calories)}</strong>
          <span className="score-unit">kcal</span>
        </div>
        <div className="score-ring">
          <div
            className="ring"
            style={{
              background: `conic-gradient(var(--accent) 0deg ${percent * 3.6}deg, rgba(255,255,255,0.14) ${percent * 3.6}deg 360deg)`,
            }}
          >
            <div className="ring-inner">
              <strong>{percent}%</strong>
              <span>da meta</span>
            </div>
          </div>
        </div>
        <div className="remaining-block">
          <span className="score-label">Restantes</span>
          <strong className="score-value accent">{numberFormat(remaining)}</strong>
          <span className="score-unit">kcal</span>
          <div className="deficit-pill">
            <span>Deficit</span>
            <strong>-{numberFormat(remaining)} kcal</strong>
          </div>
        </div>
      </div>
      <MacroPanel totals={totals} settings={settings} />
    </section>
  );
}

function MacroPanel({ totals, settings }) {
  const macros = [
    { key: "carbs", label: "Carbo", current: totals.carbs, target: settings.macroTargets.carbs },
    { key: "protein", label: "Proteina", current: totals.protein, target: settings.macroTargets.protein },
    { key: "fat", label: "Gordura", current: totals.fat, target: settings.macroTargets.fat },
    { key: "fiber", label: "Fibra", current: totals.fiber || 0, target: settings.macroTargets.fiber || 30 },
  ];

  return (
    <section className="macro-panel">
      {macros.map((macro) => (
        <article key={macro.key} className="macro-card">
          <span>{macro.label}</span>
          <strong>
            {decimalFormat(macro.current)}g <small>/ {decimalFormat(macro.target)}g</small>
          </strong>
          <div className="macro-bar">
            <div style={{ width: `${macroPct(macro.current, macro.target)}%` }} />
          </div>
          <em>{macroPct(macro.current, macro.target)}%</em>
        </article>
      ))}
    </section>
  );
}

function MealCard({
  mealType,
  entries,
  foodsById,
  expanded,
  onToggle,
  onStartAdd,
  onDeleteEntry,
  onEditEntry,
}) {
  const meta = mealMeta[mealType];
  const mealTotals = sumNutrition(entries);
  const mealTotal = mealTotals.calories;

  return (
    <article className="meal-card">
      <button className={`meal-icon meal-icon-${meta.accent}`} type="button">
        <Icon name={meta.icon} />
        <small>{meta.time}</small>
      </button>

      <div className="meal-content">
        <button className="meal-heading" type="button" onClick={() => onToggle(mealType)}>
          <div>
            <h3>{mealLabels[mealType]}</h3>
            <p>{mealTotal ? `${numberFormat(mealTotal)} kcal` : "Adicionar refeicao"}</p>
            <small>
              Carbo {decimalFormat(mealTotals.carbs)}g · Prot {decimalFormat(mealTotals.protein)}g · Gord {decimalFormat(mealTotals.fat)}g
            </small>
          </div>
          <span>{expanded ? "−" : "+"}</span>
        </button>

        {expanded ? (
          <div className="meal-body">
            {entries.length ? (
              <ul className="entry-list">
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <div>
                      <strong>{entry.foodNameSnapshot}</strong>
                      <p>
                        {entry.servingMultiplier} x {entry.servingLabelSnapshot}
                      </p>
                      <small>
                        C {decimalFormat(entry.nutritionSnapshot.carbs)}g · P {decimalFormat(entry.nutritionSnapshot.protein)}g · G {decimalFormat(entry.nutritionSnapshot.fat)}g
                      </small>
                    </div>
                    <div className="entry-actions">
                      <span>{numberFormat(entry.nutritionSnapshot.calories)} kcal</span>
                      <button type="button" onClick={() => onEditEntry(entry, foodsById[entry.foodItemId])}>
                        editar
                      </button>
                      <button type="button" onClick={() => onDeleteEntry(entry.id)}>
                        remover
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="meal-empty">Nada registrado ainda. Use o botao abaixo para adicionar.</div>
            )}
            <button className="add-inline" type="button" onClick={() => onStartAdd(mealType)}>
              <Icon name="plus" />
              Adicionar alimento
            </button>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function SearchPanel({
  foods,
  query,
  setQuery,
  selectedMeal,
  setSelectedMeal,
  onAddFood,
  onToggleFavorite,
  onEditFood,
}) {
  const filteredFoods = foods.filter((food) => {
    const haystack = normalizeText(`${food.name} ${food.brand} ${food.barcode || ""}`);
    return haystack.includes(normalizeText(query));
  });

  return (
    <section className="tab-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Buscar alimentos</p>
          <h2>Encontre e lance rapido</h2>
        </div>
      </div>

      <label className="search-box">
        <Icon name="search" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Digite alimento ou marca"
        />
      </label>

      <label className="meal-select">
        Refeicao para lancamento
        <select value={selectedMeal} onChange={(event) => setSelectedMeal(event.target.value)}>
          {Object.entries(mealLabels).map(([mealType, label]) => (
            <option key={mealType} value={mealType}>{label}</option>
          ))}
        </select>
      </label>

      {filteredFoods.length ? (
        <ul className="food-list">
          {filteredFoods.map((food) => (
            <li key={food.id}>
              <div>
                <strong>{food.name}</strong>
                <p>{food.brand || "Base propria"} · {food.defaultServingLabel}</p>
                <small>
                  {food.calories} kcal · P {decimalFormat(food.protein)}g · C {decimalFormat(food.carbs)}g · G {decimalFormat(food.fat)}g
                </small>
              </div>
              <div className="food-actions">
                <button type="button" onClick={() => onEditFood(food)}>
                  editar
                </button>
                <button type="button" onClick={() => onToggleFavorite(food.id)}>
                  {food.isFavorite ? "desfavoritar" : "favoritar"}
                </button>
                <button type="button" onClick={() => onAddFood(food, selectedMeal)}>
                  + {mealLabels[selectedMeal]}
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <strong>Nenhum alimento encontrado</strong>
          <p>Tente buscar por arroz, banana, frango ou crie um alimento manual na aba Cadastro.</p>
        </div>
      )}
    </section>
  );
}

function FavoritesPanel({ foods, onAddFood, onToggleFavorite, onEditFood, selectedMeal }) {
  const favorites = foods.filter((food) => food.isFavorite);

  return (
    <section className="tab-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Favoritos</p>
          <h2>Seu atalho diario</h2>
        </div>
      </div>

      {favorites.length ? (
        <ul className="food-list">
          {favorites.map((food) => (
            <li key={food.id}>
              <div>
                <strong>{food.name}</strong>
                <p>{food.defaultServingLabel}</p>
                <small>{food.calories} kcal por porcao</small>
              </div>
              <div className="food-actions">
                <button type="button" onClick={() => onEditFood(food)}>
                  editar
                </button>
                <button type="button" onClick={() => onToggleFavorite(food.id)}>
                  remover estrela
                </button>
                <button type="button" onClick={() => onAddFood(food, selectedMeal)}>
                  lancar agora
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <div className="empty-state">
          <strong>Sem favoritos ainda</strong>
          <p>Marque seus alimentos recorrentes na busca para acelerar o diario.</p>
        </div>
      )}
    </section>
  );
}

function CreatePanel({
  draft,
  setDraft,
  aiSettings,
  onFillFoodWithAi,
  onCreateFood,
  onCancelEditFood,
  editingFoodId,
  duplicateError,
  barcodeFallback,
  ocrState,
  onSelectOcrImage,
  onRunOcr,
  onClearOcr,
  onApplyOcr,
  speechState,
  onStartSpeech,
}) {
  const [aiDescription, setAiDescription] = useState("");
  const [aiFoodState, setAiFoodState] = useState({ status: "idle", error: "", notes: "", confidence: "" });
  const isListening = (field) => speechState.field === field && speechState.status === "listening";
  const speechSupported = speechState.supported;

  async function fillWithAi() {
    if (!aiDescription.trim()) {
      setAiFoodState({ status: "error", error: "Descreva o alimento antes de chamar a IA.", notes: "", confidence: "" });
      return;
    }

    setAiFoodState({ status: "loading", error: "", notes: "", confidence: "" });
    try {
      const result = await onFillFoodWithAi(aiDescription);
      setAiFoodState({
        status: "done",
        error: "",
        notes: result.notes || "Revise os campos antes de salvar.",
        confidence: result.confidence || "",
      });
    } catch (error) {
      setAiFoodState({ status: "error", error: error.message || "Nao foi possivel preencher com IA.", notes: "", confidence: "" });
    }
  }

  function voiceButton(field, mode = "text") {
    return (
      <button
        className={`voice-button ${isListening(field) ? "listening" : ""}`}
        type="button"
        onClick={() => onStartSpeech(field, mode)}
        disabled={!speechSupported || speechState.status === "listening"}
        aria-label={`Falar ${field}`}
      >
        {isListening(field) ? "ouvindo" : "falar"}
      </button>
    );
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">{editingFoodId ? "Edicao" : "Cadastro"}</p>
          <h2>{editingFoodId ? "Edite os atributos" : "Crie seus proprios alimentos"}</h2>
        </div>
        {editingFoodId ? (
          <button className="section-toggle" type="button" onClick={onCancelEditFood}>
            cancelar
          </button>
        ) : null}
      </div>

      {barcodeFallback ? (
        <div className="ocr-notice">
          <strong>Produto nao encontrado pelo codigo {barcodeFallback}</strong>
          <p>Use uma foto da tabela nutricional para preencher os campos abaixo e revise antes de salvar.</p>
        </div>
      ) : null}

      <form
        className="food-form"
        onSubmit={(event) => {
          event.preventDefault();
          onCreateFood();
        }}
      >
        {!editingFoodId ? <div className="ocr-card">
          <div className="ocr-card-head">
            <div>
              <p className="section-kicker">OCR no cliente</p>
              <h3>Foto da embalagem</h3>
            </div>
            <span>{ocrState.status === "reading" ? `${Math.round(ocrState.progress * 100)}%` : "local"}</span>
          </div>
          <label className="ocr-upload">
            <Icon name="camera" />
            <span>{ocrState.fileName || "Tirar foto ou escolher imagem da tabela nutricional"}</span>
            <input type="file" accept="image/*" capture="environment" onChange={onSelectOcrImage} />
          </label>
          {ocrState.status === "reading" ? (
            <div className="ocr-progress">
              <div style={{ width: `${Math.round(ocrState.progress * 100)}%` }} />
            </div>
          ) : null}
          <div className="ocr-actions">
            <button type="button" onClick={onRunOcr} disabled={!ocrState.file || ocrState.status === "reading"}>
              Ler foto
            </button>
            <button type="button" onClick={onApplyOcr} disabled={!ocrState.text || ocrState.status === "reading"}>
              Aplicar leitura
            </button>
            <button type="button" onClick={onClearOcr} disabled={ocrState.status === "reading"}>
              Limpar OCR
            </button>
          </div>
          {ocrState.error ? <div className="form-alert">{ocrState.error}</div> : null}
          {ocrState.text ? (
            <details className="ocr-text">
              <summary>Texto extraido para conferencia</summary>
              <pre>{ocrState.text}</pre>
            </details>
          ) : null}
        </div> : null}

        {!editingFoodId ? (
          <div className="ai-card">
            <div className="ocr-card-head">
              <div>
                <p className="section-kicker">IA generativa</p>
                <h3>Preencher por descricao</h3>
              </div>
              <span>{aiProviderLabel(aiSettings?.provider)}</span>
            </div>
            <label>
              Descreva o alimento
              <textarea
                value={aiDescription}
                onChange={(event) => setAiDescription(event.target.value)}
                placeholder="Ex.: 1 iogurte natural de 170g com 1 banana prata e 20g de aveia"
                rows={4}
              />
            </label>
            <div className="ocr-actions two">
              <button type="button" onClick={fillWithAi} disabled={aiFoodState.status === "loading"}>
                {aiFoodState.status === "loading" ? "Analisando..." : "Preencher com IA"}
              </button>
              <button type="button" onClick={() => setAiDescription("")} disabled={aiFoodState.status === "loading"}>
                Limpar descricao
              </button>
            </div>
            {aiFoodState.error ? <div className="form-alert">{aiFoodState.error}</div> : null}
            {aiFoodState.status === "done" ? (
              <div className="ai-note">
                <strong>Campos preenchidos pela IA</strong>
                <p>{aiFoodState.notes}</p>
                {aiFoodState.confidence ? <small>Confianca: {aiFoodState.confidence}</small> : null}
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="voice-card">
          <div>
            <p className="section-kicker">STT nativo</p>
            <strong>Preencha falando</strong>
          </div>
          <span>{speechSupported ? "microfone" : "indisponivel"}</span>
          {speechState.error ? <p>{speechState.error}</p> : null}
        </div>

        <label>
          Nome
          <div className="input-with-voice">
            <input
              value={draft.name}
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Pao integral"
            />
            {voiceButton("name")}
          </div>
        </label>
        <label>
          Marca
          <div className="input-with-voice">
            <input
              value={draft.brand}
              onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))}
              placeholder="Opcional"
            />
            {voiceButton("brand")}
          </div>
        </label>
        <label>
          Porcao base
          <div className="input-with-voice">
            <input
              value={draft.defaultServingLabel}
              onChange={(event) =>
                setDraft((current) => ({ ...current, defaultServingLabel: event.target.value }))
              }
              placeholder="Ex.: 1 fatia"
            />
            {voiceButton("defaultServingLabel")}
          </div>
        </label>

        <div className="form-grid">
          <label>
            Calorias
            <div className="input-with-voice compact">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[,.]?[0-9]*"
                value={draft.calories}
                onChange={(event) => setDraft((current) => ({ ...current, calories: event.target.value }))}
              />
              {voiceButton("calories", "number")}
            </div>
          </label>
          <label>
            Proteina
            <div className="input-with-voice compact">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[,.]?[0-9]*"
                value={draft.protein}
                onChange={(event) => setDraft((current) => ({ ...current, protein: event.target.value }))}
              />
              {voiceButton("protein", "number")}
            </div>
          </label>
          <label>
            Carbo
            <div className="input-with-voice compact">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[,.]?[0-9]*"
                value={draft.carbs}
                onChange={(event) => setDraft((current) => ({ ...current, carbs: event.target.value }))}
              />
              {voiceButton("carbs", "number")}
            </div>
          </label>
          <label>
            Gordura
            <div className="input-with-voice compact">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[,.]?[0-9]*"
                value={draft.fat}
                onChange={(event) => setDraft((current) => ({ ...current, fat: event.target.value }))}
              />
              {voiceButton("fat", "number")}
            </div>
          </label>
          <label>
            Fibra
            <div className="input-with-voice compact">
              <input
                type="text"
                inputMode="decimal"
                pattern="[0-9]*[,.]?[0-9]*"
                value={draft.fiber}
                onChange={(event) => setDraft((current) => ({ ...current, fiber: event.target.value }))}
              />
              {voiceButton("fiber", "number")}
            </div>
          </label>
        </div>

        {duplicateError ? <div className="form-alert">Ja existe um alimento com esse nome. Ajuste o cadastro para evitar duplicidade.</div> : null}

        <button className="primary-cta" type="submit">
          <Icon name="pencil" />
          {editingFoodId ? "Atualizar alimento" : "Salvar alimento"}
        </button>
      </form>
    </section>
  );
}

function ProfilePanel({
  settings,
  setSettings,
  history,
  importStatus,
  onExportCsv,
  onImportCsv,
  onAskProfileAi,
}) {
  const [profileQuestion, setProfileQuestion] = useState("");
  const [profileAiState, setProfileAiState] = useState({ status: "idle", error: "" });
  const [profileMessages, setProfileMessages] = useState([]);

  async function askProfileAi(question = profileQuestion) {
    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setProfileAiState({ status: "error", error: "Digite uma pergunta para a IA." });
      return;
    }

    setProfileAiState({ status: "loading", error: "" });
    setProfileMessages((current) => [...current, { role: "user", text: trimmedQuestion }]);
    setProfileQuestion("");
    try {
      const answer = await onAskProfileAi(trimmedQuestion);
      setProfileMessages((current) => [...current, { role: "assistant", text: answer }]);
      setProfileAiState({ status: "idle", error: "" });
    } catch (error) {
      setProfileAiState({ status: "error", error: error.message || "Nao foi possivel consultar a IA." });
    }
  }

  function updateAiSettings(field, value) {
    setSettings((current) => ({
      ...current,
      ai: {
        ...mergeSettings(current).ai,
        [field]: value,
      },
    }));
  }

  return (
    <section className="tab-panel">
      <div className="section-head">
        <div>
          <p className="section-kicker">Perfil</p>
          <h2>Metas e consistencia</h2>
        </div>
      </div>

      <div className="settings-card">
        <label>
          Meta diaria de calorias
          <input
            type="number"
            min="1000"
            step="50"
            value={settings.dailyCalorieGoal}
            onChange={(event) =>
              setSettings((current) => ({
                ...current,
                dailyCalorieGoal: Number(event.target.value),
              }))
            }
          />
        </label>

        <div className="form-grid">
          <label>
            Carbo alvo
            <input
              type="number"
              min="0"
              value={settings.macroTargets.carbs}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  macroTargets: { ...current.macroTargets, carbs: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label>
            Proteina alvo
            <input
              type="number"
              min="0"
              value={settings.macroTargets.protein}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  macroTargets: { ...current.macroTargets, protein: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label>
            Gordura alvo
            <input
              type="number"
              min="0"
              value={settings.macroTargets.fat}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  macroTargets: { ...current.macroTargets, fat: Number(event.target.value) },
                }))
              }
            />
          </label>
          <label>
            Fibra alvo
            <input
              type="number"
              min="0"
              value={settings.macroTargets.fiber}
              onChange={(event) =>
                setSettings((current) => ({
                  ...current,
                  macroTargets: { ...current.macroTargets, fiber: Number(event.target.value) },
                }))
              }
            />
          </label>
        </div>
      </div>

      <div className="history-card">
        <div className="section-head compact">
          <div>
            <p className="section-kicker">Historico recente</p>
            <h2>Ritmo dos ultimos dias</h2>
          </div>
        </div>
        <div className="history-grid">
          {history.map((item) => (
            <div key={item.date} className={`history-bar ${item.date === todayKey() ? "active" : ""}`}>
              <span>{item.label}</span>
              <strong>{item.day}</strong>
              <div>
                <i style={{ height: `${Math.min(100, Math.max(12, item.total / 25))}%` }} />
              </div>
              <small>{item.total ? numberFormat(item.total) : "—"}</small>
            </div>
          ))}
        </div>
      </div>

      <div className="backup-card">
        <div className="section-head compact">
          <div>
            <p className="section-kicker">Backup CSV</p>
            <h2>Importar e exportar tudo</h2>
          </div>
        </div>
        <p>
          Baixe ou restaure alimentos, historico de lancamentos e metas em um unico arquivo CSV.
        </p>
        <div className="backup-actions">
          <button type="button" onClick={onExportCsv}>
            Exportar CSV
          </button>
          <label>
            Importar CSV
            <input type="file" accept=".csv,text/csv" onChange={onImportCsv} />
          </label>
        </div>
        {importStatus ? <div className="backup-status">{importStatus}</div> : null}
      </div>

      <div className="ai-card">
        <div className="section-head compact">
          <div>
            <p className="section-kicker">Credenciais de IA</p>
            <h2>Provedor e chave</h2>
          </div>
        </div>
        <p className="ai-muted">
          A chave fica salva somente neste navegador junto com suas configuracoes locais.
        </p>
        <div className="form-grid">
          <label>
            Provedor
            <select value={settings.ai?.provider || "google-gemini"} onChange={(event) => updateAiSettings("provider", event.target.value)}>
              <option value="google-gemini">Google Gemini</option>
            </select>
          </label>
          <label>
            Modelo
            <input
              value={settings.ai?.model || "gemini-flash-latest"}
              onChange={(event) => updateAiSettings("model", event.target.value)}
              placeholder="gemini-flash-latest"
            />
          </label>
        </div>
        <label>
          Chave de API
          <input
            type="password"
            value={settings.ai?.apiKey || ""}
            onChange={(event) => updateAiSettings("apiKey", event.target.value)}
            placeholder="Cole sua X-goog-api-key aqui"
          />
        </label>
      </div>

      <div className="ai-card">
        <div className="section-head compact">
          <div>
            <p className="section-kicker">Assistente IA</p>
            <h2>Converse sobre seu historico</h2>
          </div>
        </div>
        <div className="ai-suggestions">
          {[
            "Resuma minha semana",
            "Estou batendo minha meta de proteina?",
            "Qual refeicao mais pesa nas calorias?",
          ].map((suggestion) => (
            <button key={suggestion} type="button" onClick={() => askProfileAi(suggestion)} disabled={profileAiState.status === "loading"}>
              {suggestion}
            </button>
          ))}
        </div>
        <div className="ai-chat-log">
          {profileMessages.length ? profileMessages.map((message, index) => (
            <div key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
              <strong>{message.role === "user" ? "Voce" : "IA"}</strong>
              <p>{message.text}</p>
            </div>
          )) : (
            <div className="ai-note">
              <strong>Pergunte sobre metas, macros e historico</strong>
              <p>A IA usa um resumo dos ultimos 30 dias, metas atuais e totais do dia.</p>
            </div>
          )}
        </div>
        <label>
          Sua pergunta
          <textarea
            value={profileQuestion}
            onChange={(event) => setProfileQuestion(event.target.value)}
            placeholder="Ex.: O que eu poderia ajustar para chegar mais perto da meta?"
            rows={3}
          />
        </label>
        <button className="primary-cta" type="button" onClick={() => askProfileAi()} disabled={profileAiState.status === "loading"}>
          {profileAiState.status === "loading" ? "Consultando IA..." : "Perguntar para IA"}
        </button>
        {profileAiState.error ? <div className="form-alert">{profileAiState.error}</div> : null}
      </div>
    </section>
  );
}

function CalendarPanel({ entries, settings }) {
  const [activeMonth, setActiveMonth] = useState(() => new Date());
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const days = buildMonthDays(activeMonth, entries);
  const activeMonthKey = monthKey(activeMonth);
  const monthEntries = entries.filter((entry) => entry.date.startsWith(activeMonthKey));
  const selectedEntries = entries.filter((entry) => entry.date === selectedDate);
  const monthlyTotal = sumNutrition(monthEntries).calories;
  const trackedDays = new Set(monthEntries.map((entry) => entry.date)).size;
  const average = trackedDays ? monthlyTotal / trackedDays : 0;
  const selectedTotal = sumNutrition(selectedEntries).calories;

  function changeMonth(direction) {
    setActiveMonth((current) => {
      const next = new Date(current);
      next.setMonth(next.getMonth() + direction);
      return next;
    });
  }

  function dayStatus(total) {
    if (!total) {
      return "empty";
    }
    const ratio = total / settings.dailyCalorieGoal;
    if (ratio < 0.75) {
      return "low";
    }
    if (ratio <= 1.05) {
      return "on";
    }
    return "over";
  }

  return (
    <section className="tab-panel calendar-panel">
      <div className="calendar-hero">
        <div>
          <p className="section-kicker">Calendario</p>
          <h2>{monthLabel(activeMonth)}</h2>
        </div>
        <div className="month-controls">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mes anterior">‹</button>
          <button type="button" onClick={() => changeMonth(1)} aria-label="Proximo mes">›</button>
        </div>
      </div>

      <div className="month-scoreboard">
        <article>
          <span>Total mensal</span>
          <strong>{numberFormat(monthlyTotal)}</strong>
          <small>kcal</small>
        </article>
        <article>
          <span>Media diaria</span>
          <strong>{numberFormat(average)}</strong>
          <small>kcal</small>
        </article>
        <article>
          <span>Dias rastreados</span>
          <strong>{trackedDays}</strong>
          <small>dias</small>
        </article>
      </div>

      <div className="calendar-weekdays">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((weekday, index) => (
          <span key={`${weekday}-${index}`}>{weekday}</span>
        ))}
      </div>

      <div className="calendar-grid">
        {days.map((day, index) =>
          day ? (
            <button
              key={day.key}
              type="button"
              className={`calendar-day ${dayStatus(day.total)} ${selectedDate === day.key ? "selected" : ""}`}
              onClick={() => setSelectedDate(day.key)}
            >
              <span>{day.day}</span>
              <strong>{day.total ? numberFormat(day.total) : "—"}</strong>
            </button>
          ) : (
            <span key={`blank-${index}`} className="calendar-day blank" />
          ),
        )}
      </div>

      <div className="selected-day-card">
        <div>
          <p className="section-kicker">Dia selecionado</p>
          <h3>
            {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("pt-BR", {
              weekday: "long",
              day: "2-digit",
              month: "short",
            })}
          </h3>
        </div>
        <strong>{numberFormat(selectedTotal)} kcal</strong>
        <p>
          {selectedEntries.length
            ? `${selectedEntries.length} lancamentos registrados nesse dia.`
            : "Sem lancamentos registrados nesse dia."}
        </p>
      </div>
    </section>
  );
}

function ActionPanel({ setActiveTab, onScanBarcode }) {
  return (
    <div className="action-panel">
      <button type="button" onClick={() => setActiveTab("search")}>
        <Icon name="search" />
        <span>Buscar alimentos</span>
      </button>
      <button className="scan-action" type="button" onClick={onScanBarcode}>
        <Icon name="barcode" />
        <span>Escanear codigo</span>
      </button>
      <button type="button" onClick={() => setActiveTab("create")}>
        <Icon name="pencil" />
        <span>Criar alimento</span>
      </button>
    </div>
  );
}

export function App() {
  const [foods, setFoods] = useState([]);
  const [entries, setEntries] = useState([]);
  const [settings, setSettings] = useState(defaultSettings);
  const [activeTab, setActiveTab] = useState("today");
  const [expandedMeals, setExpandedMeals] = useState([]);
  const [selectedMeal, setSelectedMeal] = useState("breakfast");
  const [query, setQuery] = useState("");
  const [duplicateError, setDuplicateError] = useState(false);
  const [editingFoodId, setEditingFoodId] = useState(null);
  const [barcodeFallback, setBarcodeFallback] = useState("");
  const [importStatus, setImportStatus] = useState("");
  const [ocrState, setOcrState] = useState({
    file: null,
    fileName: "",
    progress: 0,
    text: "",
    status: "idle",
    error: "",
  });
  const [speechState, setSpeechState] = useState({
    supported: Boolean(speechRecognitionConstructor()),
    field: "",
    status: "idle",
    error: "",
  });
  const [draft, setDraft] = useState({
    name: "",
    brand: "",
    defaultServingLabel: "",
    calories: "",
    protein: "",
    carbs: "",
    fat: "",
    fiber: "",
  });

  useEffect(() => {
    async function bootstrap() {
      const [foodData, entryData, settingsData] = await Promise.all([
        getAll(FOODS_STORE),
        getAll(ENTRIES_STORE),
        getAll(SETTINGS_STORE),
      ]);

      const seeded = settingsData.find((item) => item.key === SEED_KEY);
      const savedSettings = settingsData.find((item) => item.key === "preferences");

      if (!seeded) {
        await putMany(FOODS_STORE, seedFoods);
        await putItem(SETTINGS_STORE, { key: SEED_KEY, value: true });
        await putItem(SETTINGS_STORE, { key: "preferences", value: mergeSettings(defaultSettings) });
        setFoods(seedFoods);
        setEntries([]);
        setSettings(mergeSettings(defaultSettings));
        return;
      }

      setFoods(foodData);
      setEntries(entryData);
      if (savedSettings?.value) {
        setSettings(mergeSettings(savedSettings.value));
      }
    }

    bootstrap().catch(() => {});
  }, []);

  useEffect(() => {
    if (!foods.length) {
      return;
    }
    putMany(FOODS_STORE, foods).catch(() => {});
  }, [foods]);

  useEffect(() => {
    if (!entries.length) {
      return;
    }
    putMany(ENTRIES_STORE, entries).catch(() => {});
  }, [entries]);

  useEffect(() => {
    putItem(SETTINGS_STORE, { key: "preferences", value: settings }).catch(() => {});
  }, [settings]);

  const foodsById = useMemo(
    () => Object.fromEntries(foods.map((food) => [food.id, food])),
    [foods],
  );

  const todayEntries = useMemo(
    () => entries.filter((entry) => entry.date === todayKey()),
    [entries],
  );

  const totals = useMemo(() => sumNutrition(todayEntries), [todayEntries]);
  const history = useMemo(() => buildHistory(entries), [entries]);

  const percent = Math.min(
    100,
    Math.round((totals.calories / Math.max(1, settings.dailyCalorieGoal)) * 100),
  );

  const quickAdds = foods.filter((food) => quickAddIds.includes(food.id) || food.isFavorite).slice(0, 5);

  function toggleMeal(mealType) {
    setExpandedMeals((current) =>
      current.includes(mealType)
        ? current.filter((item) => item !== mealType)
        : [...current, mealType],
    );
  }

  function startAdd(mealType) {
    setSelectedMeal(mealType);
    setActiveTab("search");
  }

  async function addFood(food, mealType, forcedMultiplier, replaceEntryId = null) {
    const amount =
      forcedMultiplier ??
      Number(window.prompt(`Quantidade de ${food.defaultServingLabel} para ${mealLabels[mealType]}?`, "1"));

    if (!amount || amount <= 0) {
      return;
    }

    const nextEntry = createEntry(food, mealType, amount);

    if (replaceEntryId) {
      const updatedEntries = entries.map((entry) =>
        entry.id === replaceEntryId ? { ...nextEntry, id: replaceEntryId } : entry,
      );
      setEntries(updatedEntries);
      setActiveTab("today");
      return;
    }

    const updatedEntries = [...entries, nextEntry];
    setEntries(updatedEntries);
    await putItem(ENTRIES_STORE, nextEntry);
    setActiveTab("today");
    setExpandedMeals((current) => Array.from(new Set([...current, mealType])));
  }

  function applyOcrText(text) {
    const parsed = parseNutritionOcrText(text);
    setDraft((current) => ({ ...current, ...mergeOcrDraft(current, parsed) }));
  }

  async function fillFoodWithAi(description) {
    const text = await generateAiText(settings, buildFoodAiPrompt(description));
    const parsed = jsonFromAiText(text);
    const aiDraft = normalizeAiFoodDraft(parsed);
    setDraft((current) => ({
      ...current,
      ...Object.fromEntries(Object.entries(aiDraft).map(([key, value]) => [key, value || current[key]])),
    }));
    return parsed;
  }

  async function askProfileAi(question) {
    const context = buildProfileAiContext({ settings, entries, foods, totals, history });
    return generateAiText(settings, buildProfileAiPrompt(context, question));
  }

  function selectOcrImage(event) {
    const file = event.target.files?.[0] || null;
    setOcrState({
      file,
      fileName: file?.name || "",
      progress: 0,
      text: "",
      status: file ? "ready" : "idle",
      error: "",
    });
  }

  async function runOcr() {
    if (!ocrState.file) {
      return;
    }

    setOcrState((current) => ({ ...current, progress: 0, status: "reading", error: "" }));

    try {
      const result = await Tesseract.recognize(ocrState.file, "por+eng", {
        logger: (message) => {
          if (message.status === "recognizing text") {
            setOcrState((current) => ({ ...current, progress: message.progress || 0 }));
          }
        },
      });

      const text = result.data.text || "";
      setOcrState((current) => ({ ...current, progress: 1, text, status: "done" }));
      applyOcrText(text);
    } catch (error) {
      setOcrState((current) => ({
        ...current,
        status: "error",
        error: error.message || "Nao foi possivel ler a imagem. Tente outra foto mais nitida.",
      }));
    }
  }

  function clearOcr() {
    setOcrState({ file: null, fileName: "", progress: 0, text: "", status: "idle", error: "" });
  }

  function applyCurrentOcr() {
    if (ocrState.text) {
      applyOcrText(ocrState.text);
    }
  }

  function startSpeechInput(field, mode = "text") {
    const SpeechRecognition = speechRecognitionConstructor();

    if (!SpeechRecognition) {
      setSpeechState({
        supported: false,
        field: "",
        status: "idle",
        error: "Reconhecimento de voz indisponivel neste navegador.",
      });
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "pt-BR";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setSpeechState({ supported: true, field, status: "listening", error: "" });
    };

    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      const value = mode === "number" ? numberFromSpeech(transcript) : transcript.trim();

      if (value) {
        setDraft((current) => ({ ...current, [field]: value }));
      }
    };

    recognition.onerror = (event) => {
      setSpeechState({
        supported: true,
        field: "",
        status: "idle",
        error: event.error === "not-allowed"
          ? "Permita o acesso ao microfone para preencher falando."
          : "Nao foi possivel ouvir. Tente falar novamente.",
      });
    };

    recognition.onend = () => {
      setSpeechState((current) => ({
        ...current,
        field: "",
        status: "idle",
      }));
    };

    recognition.start();
  }

  function createFood() {
    setDuplicateError(false);
    const trimmedName = draft.name.trim();
    if (!trimmedName || !draft.defaultServingLabel.trim()) {
      return;
    }

    const exists = foods.some((food) =>
      food.id !== editingFoodId && normalizeText(food.name) === normalizeText(trimmedName)
    );
    if (exists) {
      setDuplicateError(true);
      return;
    }

    const now = new Date().toISOString();

    if (editingFoodId) {
      const currentFood = foods.find((food) => food.id === editingFoodId);
      if (!currentFood) {
        return;
      }

      const updatedFood = {
        ...currentFood,
        name: trimmedName,
        brand: draft.brand.trim(),
        defaultServingLabel: draft.defaultServingLabel.trim(),
        calories: parseLocalizedNumber(draft.calories),
        protein: parseLocalizedNumber(draft.protein),
        carbs: parseLocalizedNumber(draft.carbs),
        fat: parseLocalizedNumber(draft.fat),
        fiber: parseLocalizedNumber(draft.fiber),
        updatedAt: now,
      };

      setFoods((current) => current.map((food) => (food.id === editingFoodId ? updatedFood : food)));
      setEditingFoodId(null);
      resetDraft();
      setActiveTab("search");
      return;
    }

    const nextFood = {
      id: crypto.randomUUID(),
      barcode: barcodeFallback || undefined,
      name: trimmedName,
      brand: draft.brand.trim(),
      defaultServingLabel: draft.defaultServingLabel.trim(),
      defaultServingGrams: null,
      calories: parseLocalizedNumber(draft.calories),
      protein: parseLocalizedNumber(draft.protein),
      carbs: parseLocalizedNumber(draft.carbs),
      fat: parseLocalizedNumber(draft.fat),
      fiber: parseLocalizedNumber(draft.fiber),
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
    };

    setFoods((current) => [nextFood, ...current]);
    resetDraft();
    setBarcodeFallback("");
    clearOcr();
    setActiveTab("search");
  }

  function resetDraft() {
    setDraft({
      name: "",
      brand: "",
      defaultServingLabel: "",
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
      fiber: "",
    });
  }

  function startEditFood(food) {
    setEditingFoodId(food.id);
    setDuplicateError(false);
    setBarcodeFallback("");
    clearOcr();
    setDraft({
      name: food.name || "",
      brand: food.brand || "",
      defaultServingLabel: food.defaultServingLabel || "",
      calories: food.calories ?? "",
      protein: food.protein ?? "",
      carbs: food.carbs ?? "",
      fat: food.fat ?? "",
      fiber: food.fiber ?? "",
    });
    setActiveTab("create");
  }

  function cancelEditFood() {
    setEditingFoodId(null);
    setDuplicateError(false);
    resetDraft();
    setActiveTab("search");
  }

  async function scanBarcode() {
    const barcode = window.prompt("Digite ou leia o codigo de barras do produto:");
    const cleanBarcode = String(barcode || "").replace(/\D/g, "");

    if (!cleanBarcode) {
      return;
    }

    try {
      const existingFood = foods.find((food) => food.barcode === cleanBarcode || food.id === `barcode-${cleanBarcode}`);
      const scannedFood = existingFood || await fetchFoodByBarcode(cleanBarcode);

      if (!existingFood) {
        setFoods((current) => [scannedFood, ...current]);
        await putItem(FOODS_STORE, scannedFood);
      }

      setQuery(cleanBarcode);
      setActiveTab("search");
      await addFood(scannedFood, selectedMeal);
    } catch (error) {
      setBarcodeFallback(cleanBarcode);
      setEditingFoodId(null);
      setDraft((current) => ({ ...current, name: current.name || `Produto ${cleanBarcode}` }));
      clearOcr();
      setActiveTab("create");
    }
  }

  function toggleFavorite(foodId) {
    setFoods((current) =>
      current.map((food) =>
        food.id === foodId
          ? { ...food, isFavorite: !food.isFavorite, updatedAt: new Date().toISOString() }
          : food,
      ),
    );
  }

  async function removeEntry(entryId) {
    if (!window.confirm("Remover este alimento do diario?")) {
      return;
    }
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    await deleteItem(ENTRIES_STORE, entryId);
  }

  function editEntry(entry, food) {
    addFood(food, entry.mealType, entry.servingMultiplier, entry.id);
  }

  function exportCsv() {
    const csv = buildBackupCsv({ foods, entries, settings });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `hoje-kcal-backup-${todayKey()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setImportStatus(`Exportado: ${foods.length} alimentos e ${entries.length} lancamentos.`);
  }

  async function importCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!window.confirm("Importar este CSV vai substituir alimentos, historico e metas atuais. Continuar?")) {
      return;
    }

    try {
      const text = await file.text();
      const imported = parseBackupCsv(text);

      await Promise.all([
        clearStore(FOODS_STORE),
        clearStore(ENTRIES_STORE),
        clearStore(SETTINGS_STORE),
      ]);

      await Promise.all([
        putMany(FOODS_STORE, imported.foods),
        putMany(ENTRIES_STORE, imported.entries),
        putItem(SETTINGS_STORE, { key: SEED_KEY, value: true }),
        putItem(SETTINGS_STORE, { key: "preferences", value: imported.settings }),
      ]);

      setFoods(imported.foods);
      setEntries(imported.entries);
      setSettings(imported.settings);
      setActiveTab("profile");
      setImportStatus(`Importado: ${imported.foods.length} alimentos e ${imported.entries.length} lancamentos.`);
    } catch (error) {
      setImportStatus(error.message || "Nao foi possivel importar o CSV.");
    }
  }

  const groupedEntries = {
    breakfast: todayEntries.filter((entry) => entry.mealType === "breakfast"),
    lunch: todayEntries.filter((entry) => entry.mealType === "lunch"),
    snacks: todayEntries.filter((entry) => entry.mealType === "snacks"),
    dinner: todayEntries.filter((entry) => entry.mealType === "dinner"),
  };

  return (
    <main className="app-shell">
      <div className="noise" />
      <div className="app-frame">
        <AppHeader settings={settings} totals={totals} percent={percent} />

        <section className="section-block">
          <div className="section-head">
            <div>
              <p className="section-kicker">Diario alimentar</p>
              <h2>Ritmo do dia</h2>
            </div>
            <button
              className="section-toggle"
              type="button"
              onClick={() =>
                setExpandedMeals((current) => (current.length ? [] : Object.keys(mealLabels)))
              }
            >
              {expandedMeals.length ? "ocultar" : "mostrar"}
            </button>
          </div>

          <div className="meal-stack">
            {Object.keys(mealLabels).map((mealType) => (
              <MealCard
                key={mealType}
                mealType={mealType}
                entries={groupedEntries[mealType]}
                foodsById={foodsById}
                expanded={expandedMeals.includes(mealType)}
                onToggle={toggleMeal}
                onStartAdd={startAdd}
                onDeleteEntry={removeEntry}
                onEditEntry={editEntry}
              />
            ))}
          </div>
        </section>

        <section className="section-block">
          <div className="section-head">
            <div>
              <p className="section-kicker">Adicionar rapido</p>
              <h2>Atalhos de hoje</h2>
            </div>
            <span className="micro-tag">{mealLabels[selectedMeal]}</span>
          </div>
          <div className="quick-grid">
            {quickAdds.map((food) => (
              <button key={food.id} className="quick-card" type="button" onClick={() => addFood(food, selectedMeal)}>
                <span>{food.name.split(" ")[0]}</span>
                <strong>{food.name}</strong>
                <small>{food.calories} kcal</small>
              </button>
            ))}
            <button className="quick-card accent" type="button" onClick={() => setActiveTab("search")}>
              <Icon name="plus" />
              <strong>Mais</strong>
            </button>
          </div>
        </section>

        {activeTab === "today" ? <ActionPanel setActiveTab={setActiveTab} onScanBarcode={scanBarcode} /> : null}

        {activeTab === "search" ? (
          <SearchPanel
            foods={foods}
            query={query}
            setQuery={setQuery}
            selectedMeal={selectedMeal}
            setSelectedMeal={setSelectedMeal}
            onAddFood={addFood}
            onToggleFavorite={toggleFavorite}
            onEditFood={startEditFood}
          />
        ) : null}

        {activeTab === "favorites" ? (
          <FavoritesPanel
            foods={foods}
            selectedMeal={selectedMeal}
            onAddFood={addFood}
            onToggleFavorite={toggleFavorite}
            onEditFood={startEditFood}
          />
        ) : null}

        {activeTab === "calendar" ? (
          <CalendarPanel entries={entries} settings={settings} />
        ) : null}

        {activeTab === "create" ? (
          <CreatePanel
            draft={draft}
            setDraft={setDraft}
            aiSettings={settings.ai}
            onFillFoodWithAi={fillFoodWithAi}
            onCreateFood={createFood}
            onCancelEditFood={cancelEditFood}
            editingFoodId={editingFoodId}
            duplicateError={duplicateError}
            barcodeFallback={barcodeFallback}
            ocrState={ocrState}
            onSelectOcrImage={selectOcrImage}
            onRunOcr={runOcr}
            onClearOcr={clearOcr}
            onApplyOcr={applyCurrentOcr}
            speechState={speechState}
            onStartSpeech={startSpeechInput}
          />
        ) : null}

        {activeTab === "profile" ? (
          <ProfilePanel
            settings={settings}
            setSettings={setSettings}
            history={history}
            importStatus={importStatus}
            onExportCsv={exportCsv}
            onImportCsv={importCsv}
            onAskProfileAi={askProfileAi}
          />
        ) : null}

        <nav className="bottom-nav">
          <button
            type="button"
            className={activeTab === "today" ? "active" : ""}
            onClick={() => setActiveTab("today")}
          >
            <Icon name="target" />
            <span>Hoje</span>
          </button>
          <button
            type="button"
            className={activeTab === "search" ? "active" : ""}
            onClick={() => setActiveTab("search")}
          >
            <Icon name="search" />
            <span>Buscar</span>
          </button>
          <button
            type="button"
            className={activeTab === "calendar" ? "active" : ""}
            onClick={() => setActiveTab("calendar")}
          >
            <Icon name="calendar" />
            <span>Calend.</span>
          </button>
          <button
            type="button"
            className={activeTab === "favorites" ? "active" : ""}
            onClick={() => setActiveTab("favorites")}
          >
            <Icon name="star" />
            <span>Favoritos</span>
          </button>
          <button
            type="button"
            className={activeTab === "profile" ? "active" : ""}
            onClick={() => setActiveTab("profile")}
          >
            <Icon name="user" />
            <span>Perfil</span>
          </button>
        </nav>
      </div>
    </main>
  );
}
