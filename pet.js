/* =============================================================
   pet.js — Cat Companion mini-game
   Phase 3: core game logic (petState, images, feed, EXP)
   Phase 4: energy + sleep mechanic (Zzz, play, doPet)
   Phase 5: real-time drift-proof decay + robust persistence
     - Tunable per-30-min rates for awake and asleep states
     - Mood drains 2× when hungry (<25) OR tired (<20)
     - Auto-wake at full energy; asleep mood gently rises
     - Save on visibilitychange, beforeunload, and every action
     - Storage event keeps coin display in sync across tabs

   第五阶段：精确实时衰减 + 可靠持久化
     - 按每 30 分钟可调节的衰减速率，清醒 / 睡眠分开计算
     - 饥饿 < 25 或 精力 < 20 时心情衰减加倍
     - 精力满自动醒来；睡眠期间心情微升
     - 切换标签 / 关闭窗口时立即存档；storage 事件跨标签同步金币
   ============================================================= */


/* =============================================================
   SECTION 0: CONSTANTS
   All magic numbers in one place — easy to tune later.
   所有魔法数字集中管理，便于后期调整。
   ============================================================= */

// Feed tab item catalogue. Sorted by cost; special flags: favorite, catnip, minLevel.
// Feed 标签页食物目录，按费用排序；特殊字段：favorite / catnip / minLevel。
const FOOD_ITEMS = [
  // ── Budget ───────────────────────────────────────────────────────────────
  { id: "bargain",    label: "Bargain Bits", emoji: "🗑️", cost:   5, hunger: 40, mood:-12, exp:  3, energy:  0 },
  { id: "tomato",     label: "Tomato",       emoji: "🍅", cost:   8, hunger:  8, mood: 15, exp:  5, energy:  0, favorite: true },
  { id: "fish",       label: "Dried Fish",   emoji: "🐟", cost:  10, hunger: 15, mood:  5, exp:  8, energy:  0 },
  { id: "milk",       label: "Milk",         emoji: "🥛", cost:  15, hunger: 10, mood:  5, exp:  5, energy: 15 },
  // ── Mid-tier ─────────────────────────────────────────────────────────────
  { id: "churu",      label: "Churu",        emoji: "🐾", cost:  20, hunger: 15, mood: 20, exp: 12, energy:  0 },
  { id: "can",        label: "Cat Can",      emoji: "🥫", cost:  25, hunger: 35, mood: 10, exp: 20, energy:  0 },
  { id: "chicken",    label: "Chicken",      emoji: "🍗", cost:  30, hunger: 30, mood:  8, exp: 25, energy:  0 },
  { id: "catnip_tea", label: "Catnip Tea",   emoji: "🫖", cost:  35, hunger:  0, mood: 20, exp: 10, energy: 25, catnip: true },
  { id: "cake",       label: "Mini Cake",    emoji: "🎂", cost:  40, hunger: 10, mood: 30, exp: 30, energy:  0 },
  { id: "shrimp",     label: "Shrimp",       emoji: "🦐", cost:  45, hunger: 35, mood: 18, exp: 35, energy:  0 },
  { id: "sushi",      label: "Sashimi",      emoji: "🍣", cost:  60, hunger: 50, mood: 25, exp: 50, energy:  0 },
  // ── Premium (level-gated) ────────────────────────────────────────────────
  { id: "lobster",    label: "Lobster",      emoji: "🦞", cost:  90, hunger: 55, mood: 30, exp: 70, energy:  0, minLevel: 4 },
  { id: "wagyu",      label: "Wagyu",        emoji: "🥩", cost: 120, hunger: 60, mood: 35, exp: 90, energy:  0, minLevel: 6 },
];

const PLAY_ACTION = { cost: 15, mood: 12, energy: -15, exp: 6 };
// Play costs 15 coins, raises mood, lowers energy.
// 玩耍消耗 15 金币，提升心情，明显降低精力。

// Wearable accessories — 4 independent body slots; each equippable simultaneously.
// 可穿戴配饰：4 个独立身体槽位，可同时穿戴不同槽位的配饰。
const ACCESSORIES = [
  // ── Head ─────────────────────────────────────────────────────
  { id: "bow",        slot: "head", label: "Bow",          emoji: "🎀", cost:  30, minLevel: 1 },
  { id: "tophat",     slot: "head", label: "Top Hat",      emoji: "🎩", cost:  50, minLevel: 2 },
  { id: "floral",     slot: "head", label: "Flower Crown", emoji: "🌸", cost:  70, minLevel: 3 },
  { id: "partyhat",   slot: "head", label: "Party Hat",    emoji: "🥳", cost:  90, minLevel: 4 },
  { id: "xmashat",    slot: "head", label: "Santa Hat",    emoji: "🎅", cost:  90, minLevel: 4 },
  { id: "crown",      slot: "head", label: "Crown",        emoji: "👑", cost: 150, minLevel: 6 },
  { id: "halo",       slot: "head", label: "Halo",         emoji: "😇", cost: 250, minLevel: 8 },
  // ── Eyes ─────────────────────────────────────────────────────
  { id: "glasses",    slot: "eyes", label: "Glasses",      emoji: "👓", cost:  40, minLevel: 2 },
  { id: "sunglasses", slot: "eyes", label: "Sunglasses",   emoji: "🕶️", cost:  80, minLevel: 4 },
  { id: "eyemask",    slot: "eyes", label: "Eye Mask",     emoji: "🩹", cost: 110, minLevel: 5 },
  // ── Neck ─────────────────────────────────────────────────────
  { id: "bell",       slot: "neck", label: "Bell Collar",  emoji: "🔔", cost:  35, minLevel: 1 },
  { id: "scarf",      slot: "neck", label: "Scarf",        emoji: "🧣", cost:  60, minLevel: 3 },
  { id: "bowtie",     slot: "neck", label: "Bow Tie",      emoji: "🎀", cost:  70, minLevel: 3 },
  { id: "tie",        slot: "neck", label: "Tie",          emoji: "👔", cost:  90, minLevel: 4 },
  // ── Held ─────────────────────────────────────────────────────
  { id: "fishtoy",    slot: "held", label: "Fish Toy",     emoji: "🐟", cost:  50, minLevel: 2 },
  { id: "yarn",       slot: "held", label: "Yarn Ball",    emoji: "🧶", cost:  60, minLevel: 2 },
  { id: "balloon",    slot: "held", label: "Balloon",      emoji: "🎈", cost: 100, minLevel: 5 },
  { id: "umbrella",   slot: "held", label: "Umbrella",     emoji: "☂️", cost: 130, minLevel: 6 },
];

// Backgrounds — CSS gradient applied behind the cat image. / 猫咪背景渐变，显示在图片后方。
const BACKGROUNDS = [
  { id: "starry",  label: "Starry Night",   emoji: "🌙", cost:  80, minLevel: 2, bg: "radial-gradient(circle at 50% 40%, #1b1b40, #08081c)" },
  { id: "sunny",   label: "Sunny Window",   emoji: "🌤️", cost:  80, minLevel: 2, bg: "radial-gradient(circle at 50% 20%, #fff9e0, #ffd566)" },
  { id: "sakura",  label: "Cherry Blossom", emoji: "🌸", cost: 150, minLevel: 4, bg: "radial-gradient(circle at 50% 40%, #ffe0ea, #f5b8cc)" },
  { id: "garden",  label: "Garden",         emoji: "🌿", cost: 150, minLevel: 4, bg: "radial-gradient(circle at 50% 40%, #d0f0c0, #9ac878)" },
  { id: "xmas",    label: "Christmas",      emoji: "🎄", cost: 200, minLevel: 5, bg: "radial-gradient(circle at 50% 40%, #1c4020, #0a1e0a)" },
  { id: "beach",   label: "Beach",          emoji: "🏖️", cost: 200, minLevel: 5, bg: "linear-gradient(180deg, #87ceeb 50%, #f0e68c 50%)" },
  { id: "space",   label: "Space",          emoji: "🚀", cost: 300, minLevel: 7, bg: "radial-gradient(circle at 50% 50%, #0a0a30, #000008)" },
  { id: "castle",  label: "Castle",         emoji: "🏰", cost: 300, minLevel: 7, bg: "radial-gradient(circle at 50% 40%, #c8b090, #a08060)" },
];

// Beds — emoji shown below the cat when she sleeps. / 睡眠时显示在猫咪下方的猫窝 emoji。
const BEDS = [
  { id: "basket",  label: "Wicker Basket", emoji: "🧺", cost:  60, minLevel: 2 },
  { id: "softbed", label: "Soft Bed",      emoji: "🛏️", cost: 120, minLevel: 4 },
  { id: "villa",   label: "Cat Villa",     emoji: "🏠", cost: 250, minLevel: 6 },
];

// Skins — emoji placeholder; real cat-image art to be swapped in later.
// 皮肤 emoji 占位，等美术资源到位后替换为真实图片。
const SKINS = [
  { id: "default", label: "Natural",      emoji: "🐱", cost:   0, minLevel: 1 },
  { id: "orange",  label: "Orange Tabby", emoji: "🐱", cost: 100, minLevel: 1 },
  { id: "tiger",   label: "Tiger Stripe", emoji: "🐯", cost: 180, minLevel: 3 },
  { id: "cow",     label: "Cow Cat",      emoji: "🐮", cost: 260, minLevel: 5 },
  { id: "lion",    label: "Lion King",    emoji: "🦁", cost: 400, minLevel: 8 },
];

// Bundles — buy a full set at 20% off (only unowned items are charged).
// 套装：打八折购买一套；已拥有的道具不重复计费。
const BUNDLES = [
  { id: "birthday", label: "Birthday Bundle",  emoji: "🎂", items: ["partyhat", "balloon", "sakura"], discount: 0.8 },
  { id: "xmasset",  label: "Christmas Bundle", emoji: "🎄", items: ["xmashat",  "scarf",   "xmas"],   discount: 0.8 },
  { id: "royal",    label: "Royal Bundle",     emoji: "👑", items: ["crown",    "bowtie",  "castle"], discount: 0.8 },
];

// Milestone gifts — granted automatically when the cat first reaches a level.
// 等级里程碑：首次到达指定等级时自动赠送配饰。
const MILESTONES = [
  { level: 6, giftId: "crown", msg: "🎉 Reached Lv.6 — got a Crown!" },
  { level: 8, giftId: "halo",  msg: "🎉 Reached Lv.8 — got a Halo!"  },
];

// All rates are per real-world minute. Awake and asleep are tracked separately.
// 所有速率单位为每真实分钟。清醒与睡眠状态分开计算。
const DECAY = {
  // ── Awake ─────────────────────────────────────────────────────
  hunger:        10 / 30,   // –10 per 30 min            / 清醒每 30 分钟 –10 饱食
  mood:           5 / 30,   // –5  per 30 min (base)     / 清醒每 30 分钟 –5  心情（基础值）
  energyAwake:   10 / 30,   // –10 per 30 min            / 清醒每 30 分钟 –10 精力
  // ── Asleep ────────────────────────────────────────────────────
  energyAsleep: 100 / 60,   // full charge in ~60 min    / 约 60 分钟充满精力
  moodAsleep:     3 / 60,   // +3 per 60 min (gentle)    / 睡眠每小时 +3 心情（微升）
  hungerAsleep:   5 / 30,   // –5  per 30 min (half)     / 睡眠每 30 分钟 –5 饱食（半速）
};

// freshEquipped — empty slot map; null = nothing worn in that slot.
// 空槽位映射；null = 该槽位未穿戴任何配饰。
function freshEquipped() {
  return { head: null, eyes: null, neck: null, held: null, background: null, bed: null, skin: null };
}

// freshState — default new-game state. / 全新游戏的默认初始状态。
function freshState() {
  return {
    level: 1, exp: 0, hunger: 80, mood: 80, energy: 80,
    asleep: false, lastSeen: Date.now(),
    name: "Luna",
    owned: [], equipped: freshEquipped(),
  };
}

// EXP needed to advance from `level` to `level+1`.
// 从当前等级升到下一级所需经验：50 + (level-1)×40
// Level 1→2: 50,  Level 2→3: 90,  Level 3→4: 130, …
function expForLevel(level) {
  return 50 + (level - 1) * 40;
}


/* =============================================================
   SECTION 1: STATE PERSISTENCE
   petState 的 localStorage 读写封装。
   ============================================================= */

function loadState() {
  const raw = localStorage.getItem("petState");
  if (!raw) return freshState();
  try {
    const s = JSON.parse(raw);
    if (!Array.isArray(s.owned)) s.owned = [];

    // Migrate: pre-Phase 6b saves had equipped as null or a single string id.
    // 迁移：Phase 6b 之前的存档 equipped 为 null 或单个字符串 id。
    if (typeof s.equipped !== "object" || s.equipped === null) {
      const oldId = typeof s.equipped === "string" ? s.equipped : null;
      s.equipped  = freshEquipped();
      if (oldId) {
        const acc = ACCESSORIES.find(a => a.id === oldId);
        if (acc) s.equipped[acc.slot] = oldId;
      }
    } else {
      // Backfill any slot keys added in later phases. / 补充后续阶段新增的槽位字段。
      const blank = freshEquipped();
      for (const k of Object.keys(blank)) {
        if (!(k in s.equipped)) s.equipped[k] = blank[k];
      }
    }
    return s;
  } catch {
    return freshState(); // corrupt JSON → reset / 数据损坏时优雅重置
  }
}

function saveState(state) {
  state.lastSeen = Date.now();
  localStorage.setItem("petState", JSON.stringify(state));
}


/* =============================================================
   SECTION 2: TIME-BASED DECAY
   Apply stat changes proportional to minutes elapsed since lastSeen.
   按距上次访问的分钟数等比例衰减属性，上限 8 小时防止一次归零。
   ============================================================= */

function applyDecay(state) {
  const now     = Date.now();
  const minutes = Math.min((now - (state.lastSeen || now)) / 60000, 480);
  // Cap at 8 h so a very long absence doesn't wipe all stats at once.
  // 最多计算 480 分钟（8 小时），防止长时间离开后一次归零。

  if (state.asleep) {
    // ── Asleep: energy recovers; mood gently rises; hunger still drains (slowly)
    // 睡眠中：精力恢复，心情微升，饱食缓慢下降
    state.energy = Math.min(100, state.energy + DECAY.energyAsleep * minutes);
    state.mood   = Math.min(100, state.mood   + DECAY.moodAsleep   * minutes);
    state.hunger = Math.max(0,   state.hunger - DECAY.hungerAsleep  * minutes);
    if (state.energy >= 100) state.asleep = false; // auto-wake at full energy / 精力满自动醒来
  } else {
    // ── Awake: hunger and energy drain; mood drains 2× when hungry OR tired
    // 清醒中：饱食和精力下降；饥饿（<25）或疲惫（<20）时心情衰减加倍
    state.hunger = Math.max(0, state.hunger - DECAY.hunger      * minutes);
    state.energy = Math.max(0, state.energy - DECAY.energyAwake * minutes);

    const moodDecay = (state.hunger < 25 || state.energy < 20)
      ? DECAY.mood * 2
      : DECAY.mood;
    state.mood = Math.max(0, state.mood - moodDecay * minutes);
  }

  return state;
}


/* =============================================================
   SECTION 3: CAT IMAGE SELECTION
   Priority rules that map the current state to one image file.
   Uses the 6 images already in cats/ — no new assets needed.

   优先级规则，将当前状态映射到对应图片。
   ============================================================= */

let flashAction = null;  // "fed" | "played" | null — not persisted / 不持久化
let flashTimer  = null;

function getCatImage(state) {
  if (flashAction === "fed")                          return "cats/done-cat.png";
  if (flashAction === "played")                       return "cats/paused-cat.png";
  if (state.asleep)                                   return "cats/longbreak-cat.png";
  if (state.hunger < 40)                              return "cats/idle-cat.png";
  if (state.mood >= 70 && state.energy >= 30)         return "cats/shortbreak-cat.png";
  return "cats/focus-cat.png";
}


/* =============================================================
   SECTION 4: RENDER
   Push state → DOM. Idempotent — safe to call any time.
   将状态写入 DOM，幂等函数，随时可调用。
   ============================================================= */

let petState; // module-level reference, assigned in init() / 模块级引用，在 init() 中赋值

function render() {
  const s = petState;

  // ── Coins ────────────────────────────────────────────────────
  const coins = parseInt(localStorage.getItem("coins") || "0", 10);
  document.getElementById("coinAmount").textContent = coins;

  // ── Cat image ────────────────────────────────────────────────
  document.getElementById("petCatImg").src = getCatImage(s);

  // ── Name + Level ─────────────────────────────────────────────
  document.getElementById("catName").textContent = s.name || "Luna";
  document.getElementById("catLv").textContent = "Lv. " + s.level;

  // ── EXP bar ──────────────────────────────────────────────────
  const needed = expForLevel(s.level);
  const pct    = Math.min(100, (s.exp / needed) * 100);
  document.getElementById("expFill").style.width  = pct + "%";
  document.getElementById("expLabel").textContent = s.exp + " / " + needed + " EXP";

  // ── Stat bars ────────────────────────────────────────────────
  setStat("Fullness", s.hunger);
  setStat("Mood",     s.mood);
  setStat("Energy",   s.energy);

  // ── Sleep button label ───────────────────────────────────────
  document.getElementById("btnSleep").textContent = s.asleep ? "☀️ Wake" : "💤 Sleep";
  document.getElementById("btnPlay").textContent  = "🎾 Play · 🪙" + PLAY_ACTION.cost;
  document.getElementById("btnFeed").textContent  = "🍖 Feed · 🪙10";


  // ── Disabled states ──────────────────────────────────────────
  document.getElementById("btnFeed").disabled = s.asleep;
  document.getElementById("btnPlay").disabled = s.asleep || s.energy < 10;
  // Play also blocked when energy < 10 even if awake. / 精力低于 10 时也无法玩耍。

  // ── Zzz bubble ───────────────────────────────────────────────
  const zzzEl = document.getElementById("zzzCue");
  if (s.asleep) zzzEl.classList.add("active");
  else          zzzEl.classList.remove("active");

  // ── Sleepy status line ───────────────────────────────────────
  document.getElementById("statusLine").textContent =
    (!s.asleep && s.energy < 20) ? "😴 Sleepy... put me to bed!" : "";

  // ── Accessory overlays (head / eyes / neck / held) ──────────
  const eq    = s.equipped;
  const accEm = id => { const a = ACCESSORIES.find(x => x.id === id); return a ? a.emoji : ""; };
  document.getElementById("accHead").textContent = accEm(eq.head);
  document.getElementById("accEyes").textContent = accEm(eq.eyes);
  document.getElementById("accNeck").textContent = accEm(eq.neck);
  document.getElementById("accHeld").textContent = accEm(eq.held);

  // Bed — visible only when sleeping / 仅睡眠时显示猫窝
  const bedItem = eq.bed ? BEDS.find(b => b.id === eq.bed) : null;
  document.getElementById("accBed").textContent = (s.asleep && bedItem) ? bedItem.emoji : "";

  // Background gradient applied to cat-bg div / 背景渐变写入 cat-bg
  const bgItem = eq.background ? BACKGROUNDS.find(b => b.id === eq.background) : null;
  document.getElementById("catBg").style.background = bgItem ? bgItem.bg : "";
}

function setStat(name, rawValue) {
  const val = Math.round(rawValue);
  const el  = document.getElementById("fill" + name);
  el.style.width = val + "%";
  el.classList.toggle("stat-low",      val < 25);
  el.classList.toggle("stat-critical", val < 10);
  document.getElementById("val" + name).textContent = val;
}



/* =============================================================
   SECTION 5: LEVELLING
   Deduct EXP thresholds and increment level until EXP < threshold.
   扣除经验阈值并递增等级，直到经验低于下一级所需。
   ============================================================= */

function checkLevelUp(state) {
  let needed = expForLevel(state.level);
  while (state.exp >= needed) {
    state.exp   -= needed;
    state.level += 1;
    needed       = expForLevel(state.level);
    checkMilestones(state); // grant gifts at milestone levels / 达到里程碑时自动发放礼物
  }
}

// Grant milestone rewards the first time the cat reaches a threshold level.
// 首次到达里程碑等级时自动将奖励道具加入 owned 列表。
function checkMilestones(state) {
  MILESTONES.forEach(m => {
    if (state.level === m.level && !state.owned.includes(m.giftId)) {
      state.owned.push(m.giftId);
    }
  });
}


/* =============================================================
   SECTION 6: COIN CHECK HELPER
   Deducts coins if available; shakes the coin display if not.
   金币足够则扣除，不足则抖动金币显示框给予视觉反馈。
   ============================================================= */

function trySpendCoins(amount) {
  const coins = parseInt(localStorage.getItem("coins") || "0", 10);
  if (coins < amount) {
    const el = document.getElementById("coinDisplay");
    el.classList.remove("shake"); // reset so re-trigger works / 先移除以便重新触发
    void el.offsetWidth;          // force reflow / 强制重排
    el.classList.add("shake");
    setTimeout(() => el.classList.remove("shake"), 500);
    return false;
  }
  localStorage.setItem("coins", String(coins - amount));
  return true;
}


/* =============================================================
   SECTION 7: ACTIONS
   ============================================================= */

// ── Feed (via specific food item) ────────────────────────────
// Used by food cards in the Feed tab AND by the main Feed button.
// Feed 标签页的食物卡片和主 Feed 按钮都调用此函数。
function doFeedItem(itemId) {
  const item = FOOD_ITEMS.find(f => f.id === itemId);
  if (!item || petState.asleep) return;
  if (item.minLevel && petState.level < item.minLevel) return; // level-locked / 等级锁
  if (!trySpendCoins(item.cost)) return;

  // Hunger — clamped 0–100 / 饱食度限定 0–100
  petState.hunger = Math.min(100, Math.max(0, petState.hunger + item.hunger));

  // Mood — favorite food earns ×1.5 bonus / 最爱食物心情加成 1.5 倍
  const moodGain = item.favorite ? Math.round(item.mood * 1.5) : item.mood;
  petState.mood = Math.min(100, Math.max(0, petState.mood + moodGain));

  // Energy — drinks and special items / 饮品或特殊道具改变精力
  if (item.energy) {
    petState.energy = Math.min(100, Math.max(0, petState.energy + item.energy));
  }

  petState.exp += item.exp;
  checkLevelUp(petState);
  saveState(petState);

  if (item.catnip) {
    // Catnip: excited play expression for 1.5 s, then energy "crashes" by 10
    // 猫薄荷：兴奋玩耍表情 1.5 秒，随后精力回落 10（嗨完就累）
    flashAction = "played";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => {
      flashAction = null;
      petState.energy = Math.max(0, petState.energy - 10);
      saveState(petState);
      render();
    }, 1500);
  } else {
    flashAction = "fed";
    clearTimeout(flashTimer);
    flashTimer = setTimeout(() => { flashAction = null; render(); }, 1000);
  }

  render();
  renderFeedTab();
}

// Rename the cat — prompts user for a new name and persists it.
// 重命名猫咪，弹出输入框并持久化保存。
function startRename() {
  const input   = prompt("Enter your cat's name:", petState.name || "Luna");
  if (input === null) return;
  const trimmed = input.trim();
  if (!trimmed) return;
  petState.name = trimmed.slice(0, 20);
  saveState(petState);
  render();
}

// Quick-feed shortcut on the main action button → uses Dried Fish.
// 主操作按钮快捷喂食，默认使用最便宜的小鱼干。
function doFeed() {
  doFeedItem("fish");
}

// ── Play ─────────────────────────────────────────────────────
function doPlay() {
  if (petState.asleep) return;
  if (petState.energy < 10) return;  // too tired to play / 精力不足，无法玩耍
  if (!trySpendCoins(PLAY_ACTION.cost)) return;

  petState.mood   = Math.min(100, petState.mood   + PLAY_ACTION.mood);
  petState.energy = Math.max(0,   petState.energy + PLAY_ACTION.energy);
  petState.exp   += PLAY_ACTION.exp;
  checkLevelUp(petState);
  saveState(petState);

  flashAction = "played";
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { flashAction = null; render(); }, 1000);

  render();
}

// ── Pet (click the cat image) ────────────────────────────────
// Asleep: wakes the cat. Awake: mood +2 + brief bounce animation.
// 睡觉中点击：唤醒。清醒时点击：心情 +2 并触发弹跳动画。
function doPet() {
  if (petState.asleep) {
    petState.asleep = false;
    saveState(petState);
    render();
    renderFeedTab();
    return;
  }

  petState.mood = Math.min(100, petState.mood + 2);
  saveState(petState);

  const img = document.getElementById("petCatImg");
  img.classList.remove("cat-bounce");
  void img.offsetWidth;  // force reflow so re-clicks retrigger the animation / 强制重排
  img.classList.add("cat-bounce");
  setTimeout(() => img.classList.remove("cat-bounce"), 400);

  render();
}

// ── Sleep / Wake toggle ──────────────────────────────────────
function doSleep() {
  petState.asleep = !petState.asleep;
  saveState(petState);
  render();
  renderFeedTab(); // update disabled state on food cards / 更新食物卡片的禁用状态
}


/* =============================================================
   SECTION 8: FEED TAB — dynamic item cards
   Builds the 2-column grid of food cards from FOOD_ITEMS data.
   从 FOOD_ITEMS 数据动态构建 Feed 标签页的食物卡片网格。
   ============================================================= */

function renderFeedTab() {
  const pane  = document.getElementById("paneFeed");
  const coins = parseInt(localStorage.getItem("coins") || "0", 10);

  pane.innerHTML = '<div class="feed-grid" id="feedGrid"></div>';
  const grid = document.getElementById("feedGrid");

  FOOD_ITEMS.forEach(item => {
    const canAfford = coins >= item.cost;
    const isLocked  = !!(item.minLevel && petState.level < item.minLevel);
    const isDim     = petState.asleep || !canAfford || isLocked;

    const card = document.createElement("div");
    card.className = "food-card" + (isDim ? " food-card-dim" : "");

    // Special badges — favorite / catnip / 特殊标记：最爱食物 / 猫薄荷
    const badges =
      (item.favorite ? '<span class="food-badge food-fav">❤️ Fav ×1.5</span>' : '') +
      (item.catnip   ? '<span class="food-badge food-catnip">🌿 Catnip</span>'  : '');

    // Stat badges — prefix sign; negative values get red class
    // 属性标记：正数加 +，负数显示红色
    const hungerCls = item.hunger < 0 ? ' class="stat-neg"' : '';
    const moodCls   = item.mood   < 0 ? ' class="stat-neg"' : '';
    let statsHtml =
      '<span' + hungerCls + '>🍖 ' + (item.hunger > 0 ? '+' : '') + item.hunger + '</span>' +
      '<span' + moodCls   + '>💗 ' + (item.mood   > 0 ? '+' : '') + item.mood   + '</span>' +
      '<span>✨ +'  + item.exp + '</span>';
    if (item.energy) {
      statsHtml += '<span>⚡ ' + (item.energy > 0 ? '+' : '') + item.energy + '</span>';
    }

    // Button: lock label if level requirement not met / 等级未达时显示锁
    const btnLabel = isLocked ? '🔒 Lv.' + item.minLevel : 'Feed';

    card.innerHTML =
      (badges ? '<div class="food-badges">' + badges + '</div>' : '') +
      '<div class="food-emoji">' + item.emoji + '</div>' +
      '<div class="food-name">'  + item.label + '</div>' +
      '<div class="food-cost">🪙 ' + item.cost + '</div>' +
      '<div class="food-stats">' + statsHtml + '</div>' +
      '<button class="btn-food-use" data-id="' + item.id + '"' +
        (isDim ? ' disabled' : '') + '>' + btnLabel + '</button>';

    grid.appendChild(card);
  });

  grid.querySelectorAll(".btn-food-use").forEach(btn => {
    btn.addEventListener("click", () => doFeedItem(btn.dataset.id));
  });
}


/* =============================================================
   SECTION 9: TAB SWITCHING
   标签页切换逻辑。
   ============================================================= */

function initTabs() {
  const tabBar     = document.getElementById("tabBar");
  const tabButtons = tabBar.querySelectorAll(".tab-btn");
  // Map tab names → render functions so switching always shows fresh data.
  // 标签名称映射到渲染函数，切换时始终刷新内容。
  const tabRender  = { feed: renderFeedTab, shop: renderShopTab, closet: renderClosetTab };

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      tabButtons.forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-pane").forEach(p => p.classList.remove("active"));
      btn.classList.add("active");
      const tabName = btn.dataset.tab;
      const paneId  = "pane" + tabName.charAt(0).toUpperCase() + tabName.slice(1);
      document.getElementById(paneId).classList.add("active");
      if (tabRender[tabName]) tabRender[tabName](); // re-render on switch / 切换时刷新
    });
  });
}


/* =============================================================
   SECTION 10: SHOP TAB + CLOSET TAB
   Shop: sectioned by category (accessories / backgrounds / beds / skins / bundles).
   Closet: owned items grouped by slot; default skin always shown.

   商店：按品类分区（配饰 / 背景 / 猫窝 / 皮肤 / 套装）。
   衣柜：已拥有物品按槽位分组，默认皮肤始终显示。
   ============================================================= */

// Unified item lookup across all catalogues. / 跨所有目录的统一查找函数。
function findItemById(id) {
  return ACCESSORIES.find(x => x.id === id) ||
         BACKGROUNDS.find(x => x.id === id) ||
         BEDS.find(x => x.id === id)        ||
         SKINS.find(x => x.id === id)       || null;
}

// Build a single shop card HTML string. / 构建单个商店道具卡片的 HTML 字符串。
function makeShopCard(item, coins) {
  const owned     = petState.owned.includes(item.id);
  const locked    = petState.level < (item.minLevel || 1);
  const canAfford = coins >= item.cost;
  const dim       = owned || locked || !canAfford;

  let btnLabel, btnDisabled;
  if (owned)        { btnLabel = "Owned ✓";              btnDisabled = true; }
  else if (locked)  { btnLabel = "🔒 Lv." + item.minLevel; btnDisabled = true; }
  else              { btnLabel = "Buy 🪙" + item.cost;    btnDisabled = !canAfford; }

  return '<div class="acc-card' + (dim ? " acc-card-dim" : "") + '">' +
    '<div class="acc-emoji">' + item.emoji + '</div>' +
    '<div class="acc-name">'  + item.label + '</div>' +
    (!owned ? '<div class="acc-cost">🪙 ' + item.cost + '</div>' : '') +
    '<button class="btn-acc-buy" data-id="' + item.id + '"' +
      (btnDisabled ? ' disabled' : '') + '>' + btnLabel + '</button>' +
    '</div>';
}

// Build a bundle card with strikethrough full price → discounted price.
// 构建套装卡片，展示划线原价与折后价。
function makeBundleCard(bundle, coins) {
  const items       = bundle.items.map(id => findItemById(id)).filter(Boolean);
  const fullPrice   = items.reduce((s, it) => s + it.cost, 0);
  const unowned     = items.filter(it => !petState.owned.includes(it.id));
  const actualPrice = Math.ceil(unowned.reduce((s, it) => s + it.cost, 0) * bundle.discount);
  const allOwned    = unowned.length === 0;
  const canAfford   = coins >= actualPrice;
  const dim         = allOwned || !canAfford;

  const itemNames = items.map(it => it.emoji + ' ' + it.label).join(', ');
  let btnLabel, btnDisabled;
  if (allOwned) { btnLabel = "Owned ✓"; btnDisabled = true; }
  else          { btnLabel = "Buy 🪙" + actualPrice; btnDisabled = !canAfford; }

  return '<div class="acc-card' + (dim ? " acc-card-dim" : "") + '">' +
    '<div class="acc-emoji">' + bundle.emoji + '</div>' +
    '<div class="acc-name">'  + bundle.label + '</div>' +
    '<div class="bundle-items">' + itemNames + '</div>' +
    '<div class="acc-cost bundle-note">' +
      '<s>🪙 ' + fullPrice + '</s> → 🪙 ' + actualPrice + ' (20% off)' +
    '</div>' +
    '<button class="btn-bundle-buy" data-id="' + bundle.id + '"' +
      (btnDisabled ? ' disabled' : '') + '>' + btnLabel + '</button>' +
    '</div>';
}

// Render the Shop tab, divided into labelled sections. / 渲染商店标签页，按品类添加分区标题。
function renderShopTab() {
  const pane  = document.getElementById("paneShop");
  const coins = parseInt(localStorage.getItem("coins") || "0", 10);

  const section = (title, items, cardFn) =>
    '<div class="shop-section">' +
    '<div class="shop-section-title">' + title + '</div>' +
    '<div class="acc-grid">' + items.map(it => cardFn(it, coins)).join('') + '</div>' +
    '</div>';

  const headItems = ACCESSORIES.filter(a => a.slot === "head");
  const eyeItems  = ACCESSORIES.filter(a => a.slot === "eyes");
  const neckItems = ACCESSORIES.filter(a => a.slot === "neck");
  const heldItems = ACCESSORIES.filter(a => a.slot === "held");

  pane.innerHTML =
    section("👒 Head",       headItems, makeShopCard) +
    section("👓 Eyes",       eyeItems,  makeShopCard) +
    section("🧣 Neck",       neckItems, makeShopCard) +
    section("🐟 Held",       heldItems, makeShopCard) +
    section("🌄 Backgrounds",BACKGROUNDS, makeShopCard) +
    section("🛌 Beds",       BEDS,      makeShopCard) +
    section("🐱 Skins",      SKINS,     makeShopCard) +
    section("🎁 Bundles",    BUNDLES,   makeBundleCard);

  pane.querySelectorAll('.btn-acc-buy').forEach(btn => {
    btn.addEventListener('click', () => doBuyAcc(btn.dataset.id));
  });
  pane.querySelectorAll('.btn-bundle-buy').forEach(btn => {
    btn.addEventListener('click', () => doBuyBundle(btn.dataset.id));
  });
}

// Render the Closet tab, grouped by slot. Default skin always shown.
// 渲染衣柜标签页，按槽位分组；默认皮肤始终可见。
function renderClosetTab() {
  const pane = document.getElementById('paneCloset');

  const closetSection = (title, items, slotKey) => {
    if (!items.length) return '';
    const cards = items.map(item => {
      const isEquipped = petState.equipped[slotKey] === item.id;
      return '<div class="acc-card' + (isEquipped ? ' acc-card-equipped' : '') + '">' +
        '<div class="acc-emoji">'  + item.emoji + '</div>' +
        '<div class="acc-name">'   + item.label + '</div>' +
        (isEquipped ? '<div class="acc-equipped-label">Wearing ✨</div>' : '') +
        '<button class="btn-acc-equip" data-id="' + item.id + '" data-slot="' + slotKey + '">' +
          (isEquipped ? 'Take Off' : 'Wear') +
        '</button>' +
        '</div>';
    }).join('');
    return '<div class="shop-section">' +
      '<div class="shop-section-title">' + title + '</div>' +
      '<div class="acc-grid">' + cards + '</div>' +
      '</div>';
  };

  const ownedOf = cat =>
    ACCESSORIES.filter(a => a.slot === cat && petState.owned.includes(a.id));

  const ownedBg   = BACKGROUNDS.filter(b => petState.owned.includes(b.id));
  const ownedBeds = BEDS.filter(b => petState.owned.includes(b.id));
  // Skins: default always available; others must be owned.
  const ownedSkins = SKINS.filter(s => s.id === "default" || petState.owned.includes(s.id));

  const hasAnything = ["head","eyes","neck","held"].some(sl => ownedOf(sl).length > 0)
    || ownedBg.length || ownedBeds.length;

  if (!hasAnything && ownedSkins.length <= 1) {
    pane.innerHTML = '<p class="pane-empty">👗 No accessories yet — visit the Shop!</p>';
    return;
  }

  pane.innerHTML =
    closetSection("👒 Head",        ownedOf("head"), "head") +
    closetSection("👓 Eyes",        ownedOf("eyes"), "eyes") +
    closetSection("🧣 Neck",        ownedOf("neck"), "neck") +
    closetSection("🐟 Held",        ownedOf("held"), "held") +
    closetSection("🌄 Background",  ownedBg,         "background") +
    closetSection("🛌 Bed",         ownedBeds,       "bed") +
    closetSection("🐱 Skin",        ownedSkins,      "skin");

  pane.querySelectorAll('.btn-acc-equip').forEach(btn => {
    btn.addEventListener('click', () => doEquipAcc(btn.dataset.id, btn.dataset.slot));
  });
}

// Buy any single item from any catalogue. / 购买任意单件道具。
function doBuyAcc(itemId) {
  const item = findItemById(itemId);
  if (!item || petState.owned.includes(itemId)) return;
  if (petState.level < (item.minLevel || 1)) return;
  if (!trySpendCoins(item.cost)) return;

  petState.owned.push(itemId);
  saveState(petState);
  render();
  renderShopTab();
  renderClosetTab();
}

// Buy a bundle — charge only unowned items × discount. / 购买套装，仅对未拥有道具收取折扣价。
function doBuyBundle(bundleId) {
  const bundle  = BUNDLES.find(b => b.id === bundleId);
  if (!bundle) return;
  const unowned = bundle.items.filter(id => !petState.owned.includes(id));
  if (!unowned.length) return; // all already owned / 全部已拥有

  const items       = unowned.map(id => findItemById(id)).filter(Boolean);
  const actualPrice = Math.ceil(items.reduce((s, it) => s + it.cost, 0) * bundle.discount);
  if (!trySpendCoins(actualPrice)) return;

  unowned.forEach(id => petState.owned.push(id));
  saveState(petState);
  render();
  renderShopTab();
  renderClosetTab();
}

// Toggle equip / unequip in a specific slot. / 在指定槽位切换穿戴 / 取下。
function doEquipAcc(itemId, slotKey) {
  petState.equipped[slotKey] = (petState.equipped[slotKey] === itemId) ? null : itemId;
  saveState(petState);
  render();
  renderClosetTab();
}


/* =============================================================
   PAGE LOAD SEQUENCE
   所有函数定义完成后，按顺序执行初始化调用。
   ============================================================= */

function init() {
  petState = loadState();     // 1. Load saved state (or defaults)    / 加载保存的状态
  applyDecay(petState);       // 2. Apply time-based decay             / 应用时间衰减
  saveState(petState);        // 3. Persist updated lastSeen           / 写回更新后的时间戳
  render();                   // 4. Draw all UI                        / 渲染界面
  renderFeedTab();            // 5. Build food item cards              / 构建食物卡片
  renderShopTab();            // 6. Build shop accessory cards         / 构建商店配饰卡片
  renderClosetTab();          // 7. Build closet                       / 构建衣柜

  document.getElementById("btnFeed").addEventListener("click",   doFeed);
  document.getElementById("btnPlay").addEventListener("click",   doPlay);
  document.getElementById("btnSleep").addEventListener("click",  doSleep);
  document.getElementById("petCatImg").addEventListener("click", doPet);

  initTabs();                 // 8. Wire tab switching                 / 绑定标签切换

  // Reapply decay + re-render every 60 s while page is open.
  // 页面开着时每 60 秒重新衰减并刷新界面。
  setInterval(() => {
    applyDecay(petState);
    saveState(petState);
    render();
    renderFeedTab();
  }, 60000);

  // ── Robust persistence ───────────────────────────────────────
  // Save the moment the tab loses focus or the window closes.
  // 切换标签页或关闭窗口时立即存档，防止状态丢失。
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveState(petState);
  });
  window.addEventListener("beforeunload", () => saveState(petState));

  // Keep coin display in sync if the timer page earns coins while both tabs are open.
  // 计时器页同时开着时，storage 事件同步金币显示，无需刷新。
  window.addEventListener("storage", (e) => {
    if (e.key === "coins") render();
  });
}

init();
