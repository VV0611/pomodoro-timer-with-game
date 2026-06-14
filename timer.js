/* =============================================================
   SECTION 1: CONSTANTS (fixed values that never change)
   We use const for values that are SET ONCE and never reassigned.
   Think of const like a label on a jar — you can use what's inside,
   but you can't relabel the jar.
   ============================================================= */

let focusMinutes     = 25;  // Default focus session = 25 min
let breakMinutes     = 5;   // Default short break = 5 min
let longBreakMinutes = 15;  // Default long break after 4 rounds = 15 min
const MAX_ROUNDS     = 4;   // A full Pomodoro cycle = 4 focus sessions
/*
  WHY change const to let here?
  const = can NEVER be reassigned after creation.
  let   = CAN be reassigned later.

  We changed these to let because applySettings() will overwrite them
  when the user types a new number and clicks Apply.

  MAX_ROUNDS stays const because we never let the user change it.
*/


/* =============================================================
   SECTION 2: DOM REFERENCES
   DOM = Document Object Model = the live map of all HTML elements.
   Here we "grab" the HTML elements we need to control.
   We do this ONCE at the top and store them in variables,
   because searching for them every second would be slow.

   命令解释: document.getElementById("someId")
   → Tells the browser: "Find me the element with id='someId'"
   → Returns the element so we can store and use it.
   ============================================================= */

const timerDisplay  = document.getElementById("timerDisplay");
const modeLabel     = document.getElementById("modeLabel");
const progressBar   = document.getElementById("progressBar");
const roundInfo     = document.getElementById("roundInfo");
const btnStart      = document.getElementById("btnStart");
const btnPause      = document.getElementById("btnPause");
const statusMessage = document.getElementById("statusMessage");

// Settings panel elements
const settingsPanel  = document.getElementById("settingsPanel");
const btnSettings    = document.getElementById("btnSettings");
const inputFocus     = document.getElementById("inputFocus");
const inputBreak     = document.getElementById("inputBreak");
const inputLongBreak = document.getElementById("inputLongBreak");
const settingsError  = document.getElementById("settingsError");

// Active task display (📌 bar above timer)
const activeTaskDisplay = document.getElementById("activeTaskDisplay");
const activeTaskText    = document.getElementById("activeTaskText");

// Fullscreen button (⛶ top-right of card)
const btnFullscreen = document.getElementById("btnFullscreen");

// Weekly stats chart
const weeklyChart = document.getElementById("weeklyChart");
const weekTotal   = document.getElementById("weekTotal");


/* =============================================================
   SECTION 3: STATE VARIABLES
   These variables track the CURRENT STATE of the timer.
   They change as the user interacts with the app.

   We use let (not const) because these values WILL change.
   let = a box where you can swap what's inside.
   ============================================================= */

let totalSeconds;           // Total seconds left in the current session
let endTimestamp;           // Absolute wall-clock time (ms) when this session ends
let intervalId;             // Stores the ID of our countdown interval
let isRunning    = false;   // Is the timer currently running?
let isFocusMode  = true;    // true = Focus, false = Break (short or long)
let isLongBreak  = false;   // true only during the long break after round 4
let currentRound = 1;       // Which round we're on (1 to 4)
let sessionSeconds;         // Total seconds in the FULL session (for progress bar)

// Active task (Feature H)
let activeTaskId = null;    // id of the task the user pinned for this session

// Streak (Feature E)
let streakCount = 0;        // How many consecutive days the user has studied

// Weekly stats (Feature F)
let weeklyData = {};        // { "Thu Jun 12 2026": 3, "Fri Jun 13 2026": 5, ... }

// Ambient sound (Feature G) — YouTube IFrame Player
let ambientType = "off"; // "off"|"ocean"|"rain"|"forest"|"lofi"|"jazz1"|"jazz2"


/* =============================================================
   SECTION 4: SOUND ALERT
   Uses the Web Audio API — built into every browser, no files needed.

   WHAT IS Web Audio API?
   The browser has a built-in "music studio" called AudioContext.
   You can tell it: "create a sound wave, play it for 0.3 seconds."
   No mp3 file needed — the sound is generated from math.
   ============================================================= */

function playBeep(type) {
  /*
    AudioContext is the browser's sound engine.
    Older Safari uses "webkitAudioContext" — the || handles both.
  */
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  const ctx = new AudioCtx();

  /*
    Play a sequence of notes instead of a single beep:
      focus complete → 3 ascending notes (C5, E5, G5) — cheerful "well done!"
      break complete → 2 descending notes (E5, C5)    — gentle "back to work"

    Each note: oscillator → gainNode → speakers.
    We stagger the start times so they play one after another.
  */
  const notes = type === "focus"
    ? [{ freq: 523, t: 0 }, { freq: 659, t: 0.18 }, { freq: 784, t: 0.36 }]
    : [{ freq: 659, t: 0 }, { freq: 523, t: 0.18 }];

  notes.forEach(({ freq, t }) => {
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.type = "sine";
    osc.frequency.value = freq;

    const start = ctx.currentTime + t;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.35, start + 0.05); // quick attack
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.38); // smooth fade
    osc.start(start);
    osc.stop(start + 0.4);
  });
}


/* =============================================================
   SECTION 5: LOAD SAVED SETTINGS
   Reads focusMinutes and breakMinutes from localStorage.
   Called once before initialise() so the timer starts with saved values.
   ============================================================= */

function loadSettings() {
  const savedFocus = localStorage.getItem("focusMinutes");
  const savedBreak = localStorage.getItem("breakMinutes");
  /*
    localStorage.getItem() returns either:
      - A STRING like "30"  → if the user saved a value before
      - null                → if nothing was ever saved (first time opening)

    We check for null before using the value.
    If it's null, we just keep the defaults (25 and 5) that were set at the top.
  */

  if (savedFocus !== null) {
    /*
      !== means "is NOT equal to" (strict version).
      === means "is equal to" (strict).
      != and == are the loose versions (avoid them — they can cause surprises).

      savedFocus !== null → "only run this if savedFocus is NOT null"
      i.e. only if there is actually a saved value to load.
    */
    focusMinutes      = parseInt(savedFocus); // "30" → 30 (number)
    inputFocus.value  = focusMinutes;         // Show saved value in the input box
  }

  if (savedBreak !== null) {
    breakMinutes     = parseInt(savedBreak);
    inputBreak.value = breakMinutes;
  }

  const savedLongBreak = localStorage.getItem("longBreakMinutes");
  if (savedLongBreak !== null) {
    longBreakMinutes     = parseInt(savedLongBreak);
    inputLongBreak.value = longBreakMinutes;
    /*
      Same pattern as focus/break: read the saved string, parse it to a number,
      and display it in the input box so the user sees their saved setting.
    */
  }
}


/* =============================================================
   SECTION 6: INITIALISATION
   This runs ONCE when the page loads to set up the starting state.
   ============================================================= */

function initialise() {
  /*
    A function is a NAMED BLOCK of code you can run whenever you want.
    Syntax:
      function functionName() {
        // code goes here
      }
    You run it by calling: functionName()
  */

  totalSeconds   = focusMinutes * 60;  // e.g. 25 * 60 = 1500 seconds
  sessionSeconds = totalSeconds;         // Save a copy for progress bar
  updateDisplay();                       // Show "25:00" on screen
  updateRoundInfo();                     // Show "Round 1 / 4"
}



/* =============================================================
   SECTION 5: DISPLAY UPDATER
   Converts raw seconds into MM:SS format and updates the screen.
   ============================================================= */

function updateDisplay() {
  /*
    Math.floor() rounds DOWN to the nearest whole number.
    Example: Math.floor(90 / 60) = Math.floor(1.5) = 1  → 1 minute

    % is the MODULO (remainder) operator.
    Example: 90 % 60 = 30 → 30 seconds left after removing full minutes

    So for 90 total seconds:
      minutes = Math.floor(90 / 60) = 1
      seconds = 90 % 60             = 30
      display = "01:30"
  */

  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  /*
    String.padStart(2, "0") adds a leading zero if needed.
    Example: String(5).padStart(2, "0") = "05"  (not just "5")
    This keeps the timer looking like "04:09" instead of "4:9".
  */
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  timerDisplay.textContent = `${mm}:${ss}`;
  /*
    Template literal (backtick string): `${variable}`
    This is a modern way to build strings with variables.
    `${mm}:${ss}` becomes e.g. "25:00" or "04:59"
    It's cleaner than: mm + ":" + ss
  */

  // Update the browser tab title so user can see time even in another tab
  const modeEmoji = isFocusMode ? "🍅" : "☕";
  document.title = `${mm}:${ss} ${modeEmoji} Pomodoro`;
  /*
    document.title controls the text shown on the browser TAB.
    We update it every second (inside updateDisplay) so it stays in sync.

    isFocusMode ? "🍅" : "☕"  → ternary: show tomato if focusing, coffee if break
    Result: tab shows "24:59 🍅 Pomodoro" or "04:30 ☕ Pomodoro"

    WHY do this? If user switches to another tab while studying,
    they can still glance at the tab to see how much time is left.
  */

  // Update the progress bar width as a percentage
  const percentLeft = (totalSeconds / sessionSeconds) * 100;
  /*
    Example: 750 seconds left out of 1500 total = 50%
    progressBar.style.width = "50%" → bar is half-filled
  */
  progressBar.style.width = percentLeft + "%";
}


/* =============================================================
   SECTION 6: ROUND INFO UPDATER
   ============================================================= */

function updateRoundInfo() {
  roundInfo.textContent = `Round ${currentRound} / ${MAX_ROUNDS}`;
  /* Updates the "Round 1 / 4" text using a template literal */
}


/* =============================================================
   SECTION 7: START TIMER
   This runs when the user clicks the ▶ Start button.
   ============================================================= */

function startTimer(autoStart = false) {
  /*
    autoStart = true when called automatically from sessionComplete() (break auto-start).
    In that case we skip the status message here — sessionComplete() already set a
    more informative completion message that we don't want to overwrite.
  */
  if (isRunning) return;
  /*
    Guard clause: if the timer is ALREADY running, stop here.
    "return" exits the function immediately.
    This prevents starting multiple overlapping timers.
  */

  document.body.classList.remove("paused");
  if (isFocusMode) document.body.classList.add("running");

  isRunning = true;

  // Update button states
  btnStart.disabled = true;  // Grey out Start (can't start twice)
  btnPause.disabled = false; // Enable Pause

  // Show a motivational quote for focus sessions; a rest message for breaks.
  // Skip when auto-started by sessionComplete() — it already set the right message.
  if (!autoStart) {
    if (isFocusMode) {
      showQuote(); // Pick a random quote from the QUOTES array (Feature D)
    } else {
      statusMessage.textContent = "Rest up — you've earned it! ☕";
    }
  }
  /*
    Ternary operator: condition ? valueIfTrue : valueIfFalse
    This is a compact way to write a simple if/else.

    isFocusMode ? "Stay focused..." : "Rest up..."
    = If isFocusMode is true → "Stay focused..."
      If isFocusMode is false → "Rest up..."
  */

  // START THE COUNTDOWN
  /*
    WHY endTimestamp instead of a simple counter?

    setInterval is not perfectly accurate — the browser is free to fire
    it a few milliseconds late every tick, and those errors accumulate.
    After a 25-minute session the clock could be off by several seconds.

    Worse: when the user switches to a different tab the browser THROTTLES
    background intervals — sometimes to one fire per second, sometimes less.
    A "25-minute" Pomodoro can then take 28+ real minutes, which defeats
    the whole point of a precision study timer.

    Fix: record the ABSOLUTE wall-clock end time right now.
    Every tick, compute remaining = endTimestamp - Date.now().
    Even if the tab sleeps for 10 seconds, the very next tick snaps back
    to the correct value — zero drift, regardless of throttling.
  */
  endTimestamp = Date.now() + totalSeconds * 1000;
  intervalId   = setInterval(tick, 250); // 250ms fires = snappy display
}


/* =============================================================
   SECTION 8: TICK (called every second)
   This is the CORE of the timer — it runs once per second.
   ============================================================= */

function tick() {
  /*
    Instead of totalSeconds-- we compute remaining time from the wall clock.

    WHAT this solves:
      1. Drift — setInterval fires a few ms late every tick. Over 25 minutes
         those errors stack up to several seconds of inaccuracy.
      2. Tab throttling — browsers slow down (or pause) background intervals
         to save battery. The user switches tabs to look something up, comes
         back, and the "25-minute" Pomodoro actually ran for 28 minutes.

    FIX: endTimestamp was set in startTimer() to Date.now() + totalSeconds*1000.
    Each tick we recompute remaining = endTimestamp − Date.now().
    If the tab was throttled for 10 seconds, the very next tick snaps
    the display to the correct value — no accumulated error at all.

    We fire every 250ms (not 1000ms) so the display updates promptly,
    but we only re-render when the displayed second actually changes,
    avoiding needless DOM writes.
  */
  const remaining = Math.round((endTimestamp - Date.now()) / 1000);

  if (remaining <= 0) {
    totalSeconds = 0;
    updateDisplay();
    sessionComplete();
    return;
  }

  if (remaining !== totalSeconds) {
    // A whole second has ticked over — update the number and pulse the display
    totalSeconds = remaining;
    timerDisplay.classList.add("tick");
    setTimeout(() => timerDisplay.classList.remove("tick"), 100);
    updateDisplay();
  }
}


/* =============================================================
   SECTION 9: SESSION COMPLETE
   Called when the countdown reaches zero.
   ============================================================= */

function sessionComplete() {
  clearInterval(intervalId);
  /*
    clearInterval(id) stops the setInterval.
    Without this, tick() would keep running even at 0 seconds.
  */

  isRunning = false;
  document.body.classList.remove("running");

  // Play a beep — pass "focus" if focus just ended, "break" if break just ended
  playBeep(isFocusMode ? "focus" : "break");
  /*
    We call playBeep() HERE, right when the session ends.
    isFocusMode is still TRUE at this point (we haven't switched yet),
    so "focus" means "focus session just finished" → high-pitched beep.
    "break" means "break just finished" → lower-pitched beep.
  */

  // Visual flash animation on the card
  const card = document.querySelector(".card");
  card.classList.add("session-complete");
  setTimeout(() => card.classList.remove("session-complete"), 600);
  /*
    document.querySelector(".card") finds the first element with class "card"
    (Unlike getElementById which only works with id="...",
     querySelector works with any CSS selector like ".class" or "#id")
  */

  if (isFocusMode) {
    // FOCUS SESSION just ended → switch to either short break or long break

    incrementStats();
    /*
      A focus session just completed — add 1 to today's count.
      We call this while isFocusMode is still TRUE so we know for certain
      a focus session ended (not a break).
    */

    // Auto-complete the pinned task (Feature H)
    if (activeTaskId !== null) {
      const pinnedTask = tasks.find(t => t.id === activeTaskId);
      if (pinnedTask && !pinnedTask.done) {
        toggleTask(activeTaskId); // Tick it as done automatically
      }
      activeTaskId = null;         // Clear the pin
      updateActiveTaskDisplay();   // Hide the 📌 bar
    }

    isFocusMode = false; // We are now entering a break of some kind

    if (currentRound === MAX_ROUNDS) {
      // ── LAST ROUND → Long Break ──────────────────────────────────────
      /*
        currentRound === MAX_ROUNDS means the user just finished round 4.
        Real Pomodoro method: reward with a longer rest (15–30 min).
        We use a purple theme to make it feel special and distinct.
      */
      isLongBreak = true;
      document.body.classList.add("long-break-mode");
      document.body.classList.add("done");
      setTimeout(() => document.body.classList.remove("done"), 600);
      /*
        Adding "long-break-mode" to <body> triggers ALL the purple CSS rules:
          .long-break-mode { background: purple gradient }
          .long-break-mode .mode-label { color: lavender }
          .long-break-mode .progress-bar { background: purple }
          etc.
      */
      modeLabel.textContent = "Long Break";
      totalSeconds   = longBreakMinutes * 60; // e.g. 15 * 60 = 900 seconds
      sessionSeconds = totalSeconds;
      statusMessage.textContent = `Cycle complete! 🏆 Enjoy your ${longBreakMinutes}-min long break!`;
      showNotification("Cycle complete! 🏆", `You earned a ${longBreakMinutes}-min long break — great work!`);

    } else {
      // ── REGULAR ROUND → Short Break ──────────────────────────────────
      isLongBreak = false;
      document.body.classList.add("break-mode");
      modeLabel.textContent = "Break";
      totalSeconds   = breakMinutes * 60; // e.g. 5 * 60 = 300 seconds
      sessionSeconds = totalSeconds;
      statusMessage.textContent = "Focus session done! Break starting... 🎉";
      showNotification("Focus session complete! 🎉", "Great work — your break is starting now ☕");
    }

    startTimer(true); // Auto-start the break; pass true to preserve the completion message

  } else {
    // BREAK (short or long) just ended → switch back to FOCUS

    if (isLongBreak) {
      // ── LONG BREAK just ended → reset the whole cycle ────────────────
      document.body.classList.remove("long-break-mode");
      currentRound = 1; // Back to round 1 — fresh cycle starts
      statusMessage.textContent = "Long break over — ready for a brand new cycle! 🍅";
      showNotification("Long break over! 💪", "Ready to start a fresh new cycle?");

    } else {
      // ── SHORT BREAK just ended → advance to next round ───────────────
      document.body.classList.remove("break-mode");
      currentRound++;
      /*
        currentRound++ adds 1. Since we checked currentRound === MAX_ROUNDS
        BEFORE starting the break (in the focus-end branch above), we know
        that if we're here, currentRound was < MAX_ROUNDS, so incrementing
        is safe and won't go past MAX_ROUNDS.
      */
      statusMessage.textContent = `Round ${currentRound - 1} done! Ready for round ${currentRound}? 🍅`;
      showNotification("Break's over! 💪", "Ready for the next focus session? You've got this!");
    }

    isLongBreak   = false;
    isFocusMode   = true;
    modeLabel.textContent = "Focus";
    totalSeconds   = focusMinutes * 60;
    sessionSeconds = totalSeconds;
    updateRoundInfo();

    // After any break, DON'T auto-start — let the user decide when to begin
    updateDisplay();
    btnStart.disabled = false;
    btnPause.disabled = true;
  }
}


/* =============================================================
   SECTION 10: PAUSE TIMER
   ============================================================= */

function pauseTimer() {
  if (!isRunning) return;
  /*
    ! is the NOT operator.
    !isRunning means "if isRunning is false"
    So: "if the timer is NOT running, do nothing."
  */

  clearInterval(intervalId); // Stop the countdown
  isRunning = false;
  document.body.classList.remove("running");
  document.body.classList.add("paused");

  btnStart.disabled = false;  // Re-enable Start (so they can resume)
  btnPause.disabled = true;   // Grey out Pause (can't pause what's stopped)

  statusMessage.textContent = "Paused. Press Start to continue.";
}


/* =============================================================
   SECTION 11: RESET TIMER
   Brings everything back to the initial state.
   ============================================================= */

function resetTimer() {
  clearInterval(intervalId); // Stop any running countdown
  isRunning = false;

  // Reset ALL state variables back to defaults
  isFocusMode  = true;
  isLongBreak  = false;
  currentRound = 1;
  activeTaskId = null;         // Unpin any active task
  updateActiveTaskDisplay();   // Hide the 📌 bar

  // Remove ALL mode classes — covers all states
  document.body.classList.remove("break-mode", "long-break-mode", "running", "paused", "done");
  modeLabel.textContent = "Focus";

  // Reset button states
  btnStart.disabled = false;
  btnPause.disabled = true;

  // Reset the display
  statusMessage.textContent = "Press Start to begin your focus session.";
  initialise(); // Re-run setup: sets totalSeconds = 1500 and updates display
}


/* =============================================================
   SECTION 12: TOGGLE SETTINGS PANEL
   Shows or hides the ⚙ settings panel when gear button is clicked.
   ============================================================= */

function toggleSettings() {
  /*
    classList.toggle("x") is a shortcut that:
      - ADDS class "x" if it's not there yet
      - REMOVES class "x" if it's already there

    It's the same as writing:
      if (element.classList.contains("x")) {
        element.classList.remove("x");
      } else {
        element.classList.add("x");
      }

    One line instead of five — very handy for open/close toggles.
  */
  settingsPanel.classList.toggle("settings-open");
  btnSettings.classList.toggle("active");
  /*
    When "settings-open" is added to the panel:
      CSS: max-height goes from 0 → 200px = panel slides down (visible)
    When "settings-open" is removed:
      CSS: max-height goes from 200px → 0 = panel slides back up (hidden)

    When "active" is added to the gear button:
      CSS: button turns red and rotates 90° = shows user settings are open
  */

  // Clear any old error message whenever the panel is toggled
  settingsError.textContent = "";
}


/* =============================================================
   SECTION 13: APPLY SETTINGS
   Reads user input, validates it, then updates the timer durations.
   ============================================================= */

function applySettings() {
  /*
    STEP 1: Read the input values.

    inputFocus.value gives us the text INSIDE the input box.
    Important: input values are always STRINGS (text), even if the user
    typed a number. "25" is a string, not the number 25.

    parseInt("25")  → 25   (converts string to whole number)
    parseInt("abc") → NaN  (NaN = "Not a Number" — invalid input)
    parseInt("5.9") → 5    (parseInt cuts off the decimal — takes the integer part)
  */
  const newFocus     = parseInt(inputFocus.value);
  const newBreak     = parseInt(inputBreak.value);
  const newLongBreak = parseInt(inputLongBreak.value);

  // STEP 2: Validate — check all three values are acceptable numbers
  if (isNaN(newFocus) || newFocus < 1 || newFocus > 60) {
    /*
      isNaN() = "is Not a Number?" → true if the value is NaN
      newFocus < 1  = they typed 0 or negative (not allowed)
      newFocus > 60 = unreasonably long session

      || means OR: if ANY of these conditions is true, show the error.
    */
    settingsError.textContent = "Focus time must be 1–60 minutes.";
    inputFocus.focus(); // Move cursor back to the focus input
    /*
      .focus() = programmatically click on an input,
      so the user's cursor goes there and they can fix the value.
    */
    return; // Stop here — don't apply invalid settings
  }

  if (isNaN(newBreak) || newBreak < 1 || newBreak > 30) {
    settingsError.textContent = "Break time must be 1–30 minutes.";
    inputBreak.focus();
    return;
  }

  if (isNaN(newLongBreak) || newLongBreak < 5 || newLongBreak > 60) {
    settingsError.textContent = "Long break must be 5–60 minutes.";
    inputLongBreak.focus();
    return;
  }

  // STEP 3: All valid — update the variables
  focusMinutes     = newFocus;
  breakMinutes     = newBreak;
  longBreakMinutes = newLongBreak;

  // STEP 3b: Save all three to localStorage
  localStorage.setItem("focusMinutes",     focusMinutes);
  localStorage.setItem("breakMinutes",     breakMinutes);
  localStorage.setItem("longBreakMinutes", longBreakMinutes);
  /*
    WHAT IS localStorage?
    localStorage is like a small notebook built into the browser.
    It stores text (key → value pairs) permanently on the user's computer.
    It survives: closing the tab, closing the browser, restarting the computer.
    It resets only if the user clears browser data.

    localStorage.setItem("key", value)
      → Writes: open the notebook, find the page called "key", write "value"
      → Example: localStorage.setItem("focusMinutes", 30)
        saves the text "30" under the name "focusMinutes"

    localStorage.getItem("key")
      → Reads:  open the notebook, find the page called "key", read what's there
      → Returns null if the key doesn't exist yet (first time the app is opened)

    IMPORTANT: localStorage only stores STRINGS (text).
    So even if you store the number 30, it comes back as the string "30".
    That's why we use parseInt() when reading it back.
  */

  // STEP 4: Clear error, close panel, reset timer with new values
  settingsError.textContent = "";
  toggleSettings(); // Close the panel (slide it back up)

  // Only reset if the timer isn't currently running
  // (Don't interrupt a session that's already in progress)
  if (!isRunning) {
    resetTimer();
    /*
      resetTimer() calls initialise() which uses the updated focusMinutes.
      So the timer will immediately show the new time (e.g. "30:00").
    */
  }

  statusMessage.textContent = `Settings saved! Focus: ${focusMinutes}min, Break: ${breakMinutes}min, Long: ${longBreakMinutes}min ✓`;
}


/* =============================================================
   LEARNING SUMMARY — KEY CONCEPTS USED IN THIS FILE:
   ─────────────────────────────────────────────────────────────
   const / let          → Declare variables (const = fixed, let = changeable)
   function name() {}  → Define a reusable block of code
   if / else           → Make decisions based on conditions
   condition ? a : b   → Ternary: shorthand if/else
   setInterval(fn, ms) → Run a function every X milliseconds
   clearInterval(id)   → Stop a setInterval
   setTimeout(fn, ms)  → Run a function ONCE after X milliseconds
   variable--          → Decrement (subtract 1)
   Math.floor()        → Round down to whole number
   % (modulo)          → Get the remainder after division
   template literal    → `Hello ${name}` (backtick string with variables)
   document.getElementById()  → Find HTML element by id
   document.querySelector()   → Find HTML element by CSS selector
   element.textContent        → Read or set the text inside an element
   element.style.property     → Change a CSS property via JavaScript
   element.classList.add()    → Add a CSS class to an element
   element.classList.remove() → Remove a CSS class from an element
   element.disabled           → Enable or disable a button
   JSON.stringify()           → Convert array/object → string (for localStorage)
   JSON.parse()               → Convert string → array/object (from localStorage)
   array.push()               → Add item to end of array
   array.filter()             → Return new array keeping only items that pass a test
   array.find()               → Return the first item that passes a test
   array.forEach()            → Loop through every item in an array
   array.length               → How many items are in an array
   Date.now()                 → Current timestamp in ms — useful as a unique ID
   document.createElement()   → Create a new HTML element in JavaScript
   element.append()           → Add child elements into a parent element
   element.dataset.id         → Read/write data-id="..." attributes
   event.key                  → Which keyboard key was pressed
   ============================================================= */


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE A: KEYBOARD SHORTCUTS                   ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

/* =============================================================
   SECTION A1: KEYBOARD SHORTCUTS
   Space = start / pause toggle   R = reset

   We listen on `document` (the whole page), not on a single button.
   This means the shortcut works wherever the user's focus is,
   as long as they are NOT typing in a text input.
   ============================================================= */

document.addEventListener("keydown", function(event) {
  /*
    addEventListener("keydown", fn) attaches a listener to the document.
    "keydown" fires the moment a key is PRESSED DOWN (before it's released).
    The browser passes an event object — we named it "event".

    event.key  = the CHARACTER of the key pressed ("a", " ", "R", "Enter"...)
    event.code = the PHYSICAL key on keyboard ("Space", "KeyR", "Enter"...)

    We check event.code for Space because event.key = " " (a space character)
    which can be confusing. event.code = "Space" is clearer.
  */

  // ── GUARD: don't fire shortcuts while user is typing ──────────────────
  const activeTag = document.activeElement.tagName;
  /*
    document.activeElement = the element that currently has FOCUS
    (i.e. the one that receives keyboard input).
    .tagName returns its tag name in UPPERCASE: "INPUT", "TEXTAREA", "BUTTON"...

    If the user is typing in the task input box or the settings number inputs,
    we must NOT trigger shortcuts — otherwise pressing Space would pause the
    timer while they're mid-sentence.
  */
  if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
  /*
    If focus is on any <input> or <textarea>, exit this function immediately.
    The keypress goes to the input as normal text, not as a shortcut.
  */

  // ── SPACE: toggle start / pause ───────────────────────────────────────
  if (event.code === "Space") {
    event.preventDefault();
    /*
      By default, pressing Space scrolls the page DOWN.
      event.preventDefault() cancels that default browser behaviour.
      Now Space only does what WE want it to do.
    */

    if (isRunning) {
      pauseTimer();  // Timer is running → pause it
    } else {
      startTimer();  // Timer is paused / stopped → start it
    }
  }

});


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE B: TODAY'S POMODORO COUNT               ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

/* =============================================================
   SECTION B1: STATS — DOM REFERENCE & STATE
   ============================================================= */

const pomodoroCountEl = document.getElementById("pomodoroCount");
/*
  We named this pomodoroCountEl (El = element) to avoid confusion with
  any variable also named pomodoroCount.
*/

let pomodoroCount = 0;
// How many focus sessions completed today. Resets to 0 at midnight.


/* =============================================================
   SECTION B2: LOAD STATS
   Called once on page load. Reads saved count from localStorage
   and checks if it belongs to today — if not, resets to 0.
   ============================================================= */

function loadStats() {
  const saved = localStorage.getItem("pomodoroStats");
  /*
    localStorage stores a JSON string like:
      '{"date":"Wed Jun 11 2026","count":3}'

    If nothing was saved yet, getItem returns null.
  */

  if (saved !== null) {
    const data = JSON.parse(saved);
    /*
      JSON.parse() converts the string back into a real JS object:
        '{"date":"Wed Jun 11 2026","count":3}'
        → { date: "Wed Jun 11 2026", count: 3 }

      Now we can access data.date and data.count.
    */

    const today = new Date().toDateString();
    /*
      new Date() creates a Date object representing RIGHT NOW.
      .toDateString() converts it to a short human-readable string:
        "Wed Jun 11 2026"

      We use this as our "date key" — it's simple and consistent.
      Two calls on the SAME day produce the SAME string → counts match.
      Two calls on DIFFERENT days produce DIFFERENT strings → reset.
    */

    if (data.date === today) {
      pomodoroCount = data.count;
      // Same day → restore the saved count
    } else {
      pomodoroCount = 0;
      // Different day → it's a new day, start fresh at 0
    }
  }

  updateStatsDisplay(); // Refresh the 🍅 display
}


/* =============================================================
   SECTION B3: SAVE STATS
   Saves the current count + today's date to localStorage.
   ============================================================= */

function saveStats() {
  const today = new Date().toDateString(); // e.g. "Wed Jun 11 2026"

  localStorage.setItem("pomodoroStats", JSON.stringify({
    date:  today,
    count: pomodoroCount
  }));
  /*
    We save BOTH the date and the count together as one object.
    This lets loadStats() compare dates on the next visit.

    JSON.stringify({ date: "Wed Jun 11 2026", count: 3 })
    → '{"date":"Wed Jun 11 2026","count":3}'
  */
}


/* =============================================================
   SECTION B4: INCREMENT STATS
   Called each time a FOCUS session ends.
   ============================================================= */

function incrementStats() {
  pomodoroCount++;
  // ++ is the INCREMENT operator: adds 1.

  saveStats();
  updateStatsDisplay();
  checkStreak();        // Update consecutive-day streak (Feature E)
  updateWeeklyStats();  // Update the 7-day chart data (Feature F)
}


/* =============================================================
   SECTION B5: UPDATE STATS DISPLAY
   Refreshes the 🍅 × N text and plays a bounce animation.
   ============================================================= */

function updateStatsDisplay() {
  pomodoroCountEl.textContent = `🍅 × ${pomodoroCount}`;
  // Example: "🍅 × 3"  or  "🍅 × 0"

  if (pomodoroCount > 0) {
    // Trigger the bounce animation by adding class "bump"...
    pomodoroCountEl.classList.add("bump");

    setTimeout(() => pomodoroCountEl.classList.remove("bump"), 350);
    /*
      ...then remove it 350ms later.
      The CSS transition takes care of the spring animation.
      Adding and removing a class is a very common pattern to
      "fire" a CSS animation on demand from JavaScript.
    */
  }
}


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE C: BROWSER NOTIFICATIONS                ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

/* =============================================================
   SECTION C1: NOTIFICATIONS — DOM REFERENCE & STATE
   ============================================================= */

const btnNotification = document.getElementById("btnNotification");

let notificationsEnabled = false;
// Tracks whether the user has granted notification permission.


/* =============================================================
   SECTION C2: REQUEST NOTIFICATION PERMISSION
   Called when user clicks the 🔔/🔕 button.

   IMPORTANT: Browsers only allow requestPermission() to be called
   as a DIRECT result of a user action (a click).
   We can NEVER call it automatically on page load — browsers block it.
   This is a privacy protection rule.
   ============================================================= */

async function requestNotificationPermission() {
  /*
    "async" before a function means it can use "await" inside.
    async/await is a modern way to handle ASYNCHRONOUS operations —
    things that take time (like waiting for user to click "Allow").

    Without async/await, we'd need to use .then() callbacks (older style).
    async/await is cleaner and easier to read.
  */

  // ── Check 1: Does this browser support notifications at all? ──────────
  if (!("Notification" in window)) {
    /*
      "Notification" in window  checks if the Notification API exists
      in the global window object.
      Old browsers (e.g. IE11) don't have it.
      ! reverses the check: "if Notification does NOT exist..."
    */
    statusMessage.textContent = "This browser doesn't support notifications 😕";
    return;
  }

  // ── Check 2: Already denied? Can't re-ask programmatically ────────────
  if (Notification.permission === "denied") {
    /*
      Notification.permission is a string — one of three values:
        "default"  → user hasn't been asked yet
        "granted"  → user said Allow
        "denied"   → user said Block

      Once "denied", the browser won't show the permission pop-up again.
      The user must manually unblock in browser settings.
    */
    statusMessage.textContent = "Notifications blocked. Unblock in browser settings 🔧";
    return;
  }

  // ── Check 3: Already granted? Just toggle off ─────────────────────────
  if (Notification.permission === "granted" && notificationsEnabled) {
    notificationsEnabled = false;
    updateBellButton();
    statusMessage.textContent = "Notifications turned off.";
    return;
    /*
      If notifications were already ON and user clicks the bell again,
      we toggle them OFF (disable without revoking the browser permission).
    */
  }

  // ── Ask for permission ────────────────────────────────────────────────
  const permission = await Notification.requestPermission();
  /*
    await pauses this function until the user clicks Allow or Block.
    The browser shows its native permission dialog.
    After the user responds, permission = "granted" or "denied".

    This is why the function must be async — await only works inside async functions.
  */

  notificationsEnabled = (permission === "granted");
  /*
    (permission === "granted") evaluates to true or false.
    We assign that boolean directly to notificationsEnabled.
    Cleaner than: if (permission === "granted") { notificationsEnabled = true; }
  */

  updateBellButton();

  if (notificationsEnabled) {
    statusMessage.textContent = "Notifications ON! We'll alert you when sessions end 🔔";
  } else {
    statusMessage.textContent = "Notifications blocked 🔕";
  }
}


/* =============================================================
   SECTION C3: UPDATE BELL BUTTON APPEARANCE
   Swaps the emoji and CSS class to reflect current state.
   ============================================================= */

function updateBellButton() {
  if (notificationsEnabled) {
    btnNotification.textContent = "🔔"; // Bell with sound = ON
    btnNotification.classList.add("active");
    /*
      CSS class "active" gives the bell a golden glow (see timer.css).
      classList.add() adds it. classList.remove() takes it away.
    */
  } else {
    btnNotification.textContent = "🔕"; // Bell muted = OFF
    btnNotification.classList.remove("active");
  }
}


/* =============================================================
   SECTION C4: SHOW NOTIFICATION
   Creates and displays a desktop notification pop-up.
   Called from sessionComplete() when a session ends.
   ============================================================= */

function showNotification(title, body) {
  /*
    Parameters:
      title → the bold heading of the notification pop-up
      body  → the smaller description text below the title
  */

  if (!notificationsEnabled) return;
  // If user didn't enable notifications, do nothing.

  if (Notification.permission !== "granted") return;
  // Double-check permission is still granted (user can revoke in browser settings).

  new Notification(title, { body: body });
  /*
    new Notification(title, options) creates and immediately shows a
    desktop notification.

    "new" creates a new INSTANCE of the Notification class.
    options is an object: { body: "...", icon: "...", ... }

    The pop-up appears even if the user is looking at a different tab
    or a different application — that's the whole point!

    What the user sees:
    ┌────────────────────────────────┐
    │ 🔔  timer.html                 │
    │ Focus session complete! 🎉     │  ← title
    │ Time for a well-earned break   │  ← body
    └────────────────────────────────┘
  */
}


/* =============================================================
   SECTION C4b: NOTIFICATION PERMISSION PROMPT BANNER
   Shows an in-app banner on first visit asking the user to allow
   notifications. Browsers require a user click before we can call
   Notification.requestPermission(), so we can't trigger it on
   page load directly — we show our own UI first, then the user's
   click on "Allow" satisfies the browser's gesture requirement.
   ============================================================= */

function showNotifPrompt() {
  if (!("Notification" in window)) return;           // browser doesn't support it
  if (Notification.permission !== "default") return; // already decided (granted or denied)
  if (sessionStorage.getItem("notifPromptDismissed")) return; // dismissed this session

  document.getElementById("notifPrompt").classList.add("visible");
}

async function allowNotifPrompt() {
  document.getElementById("notifPrompt").classList.remove("visible");
  await requestNotificationPermission();
}

function skipNotifPrompt() {
  document.getElementById("notifPrompt").classList.remove("visible");
  sessionStorage.setItem("notifPromptDismissed", "1");
  // "1" stored in sessionStorage — clears automatically when the tab is closed,
  // so the prompt will show again on a fresh visit but not on the same session.
}


/* =============================================================
   SECTION C5: INIT NOTIFICATIONS ON PAGE LOAD
   If the user previously granted permission, re-enable automatically.
   ============================================================= */

function initNotifications() {
  if ("Notification" in window && Notification.permission === "granted") {
    notificationsEnabled = true;
    updateBellButton();
    /*
      We check this on load so returning users don't have to click
      the bell button again every time they open the page.
      Permission is remembered by the browser permanently.
    */
  }
}


/* =============================================================
   ████████╗ █████╗ ███████╗██╗  ██╗    ██╗     ██╗███████╗████████╗
      ██╔══╝██╔══██╗██╔════╝██║ ██╔╝    ██║     ██║██╔════╝╚══██╔══╝
      ██║   ███████║███████╗█████╔╝     ██║     ██║███████╗   ██║
      ██║   ██╔══██║╚════██║██╔═██╗     ██║     ██║╚════██║   ██║
      ██║   ██║  ██║███████║██║  ██╗    ███████╗██║███████║   ██║
      ╚═╝   ╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝   ╚══════╝╚═╝╚══════╝   ╚═╝
   ============================================================= */


/* =============================================================
   SECTION 14: TASK LIST — DOM REFERENCES
   Grab the HTML elements we need to read and update.
   ============================================================= */

const taskInput  = document.getElementById("taskInput");
const btnAddTask = document.getElementById("btnAddTask");
const taskList   = document.getElementById("taskList");
const taskCount  = document.getElementById("taskCount");


/* =============================================================
   SECTION 15: TASK LIST — STATE
   ============================================================= */

let tasks = [];
/*
  tasks is an ARRAY — a list that holds multiple items.
  Each item (task) is an OBJECT with three properties:

    { id: 1749600000000, text: "Write essay", done: false }

  id   → a unique number (we use Date.now() which gives the current
          timestamp in milliseconds — always different each time)
  text → the task description the user typed
  done → true = completed, false = still todo

  [] = empty array (no tasks yet when the page first loads)
*/


/* =============================================================
   SECTION 16: ADD TASK
   Called when user clicks "+" or presses Enter.
   ============================================================= */

function addTask() {
  const text = taskInput.value.trim();
  /*
    .value      → reads what the user typed into the input box
    .trim()     → removes any leading/trailing spaces
                  "  hello  " becomes "hello"
                  This prevents adding tasks that are just spaces.
  */

  if (text === "") return;
  /*
    Guard clause: if the text is empty after trimming, do nothing.
    === is STRICT equality: checks both value AND type.
    "" === ""  → true  (both empty strings)
    0  === ""  → false (number vs string — not the same!)

    Always use === instead of == in JavaScript.
  */

  const newTask = {
    id:   Date.now(),
    /*
      Date.now() returns the current time as a number (milliseconds since 1970).
      Example: 1749600000000
      This guarantees a UNIQUE id every time — two tasks can't have the same id
      because they're created at different moments in time.
    */
    text: text,
    done: false
  };
  /*
    An OBJECT LITERAL — we're creating a new object using { } syntax.
    Think of it as a row in a table:
      | id             | text          | done  |
      | 1749600000000  | "Write essay" | false |
  */

  tasks.push(newTask);
  /*
    Array.push() adds the new item to the END of the array.
    Before: tasks = []
    After:  tasks = [{ id: 174..., text: "Write essay", done: false }]
  */

  saveTasks();      // Save updated array to localStorage
  renderTasks();    // Re-draw the list on screen

  taskInput.value = "";
  taskInput.focus();
  /*
    After adding, clear the input and put the cursor back in it.
    This lets the user quickly type another task without clicking.
  */
}


/* =============================================================
   SECTION 17: TOGGLE TASK (mark done / undo)
   ============================================================= */

function toggleTask(id) {
  /*
    id is passed in as an argument — it tells us WHICH task to toggle.
    We look for the task with that exact id inside the tasks array.
  */

  const task = tasks.find(t => t.id === id);
  /*
    Array.find() scans the array and returns the FIRST item where the
    condition is true. If nothing matches, it returns undefined.

    t => t.id === id
    This is an ARROW FUNCTION used as a "test":
      For each item t in the array, check if t.id equals our target id.
      find() stops as soon as one matches.

    Example:
      tasks = [{ id: 111, text: "A" }, { id: 222, text: "B" }]
      tasks.find(t => t.id === 222)  →  { id: 222, text: "B" }
  */

  if (task) {
    task.done = !task.done;
    /*
      ! is the NOT operator (flips true/false):
        task.done = false  →  !task.done = true   → task is now DONE
        task.done = true   →  !task.done = false  → task is UNDONE

      This is the "toggle" — one line that works in both directions.
    */
  }

  saveTasks();
  renderTasks();
}


/* =============================================================
   SECTION 18: DELETE TASK
   Plays a removal animation, then removes from the array.
   ============================================================= */

function deleteTask(id) {
  const item = document.querySelector(`.task-item[data-id="${id}"]`);
  /*
    document.querySelector() finds an element using a CSS selector.
    `.task-item[data-id="123"]` means:
      "Find an element with class 'task-item' AND attribute data-id="123"

    data-id="..." is a CUSTOM HTML ATTRIBUTE we set in renderTasks().
    It stores the task's id directly on the HTML element so we can
    find that specific element later.
  */

  if (item) {
    item.classList.add("task-removing");
    /*
      Adding class "task-removing" triggers the CSS @keyframes taskSlideOut:
      the item fades out and collapses its height over 0.28 seconds.
      But the data is still in the tasks array — we delete it AFTER the animation.
    */

    setTimeout(() => {
      tasks = tasks.filter(t => t.id !== id);
      /*
        Array.filter() creates a NEW array containing only items
        where the condition is TRUE.

        t => t.id !== id
        "Keep this task only if its id is NOT the one we're deleting."

        Before: tasks = [{ id:111 }, { id:222 }, { id:333 }]
        filter(t => t.id !== 222)
        After:  tasks = [{ id:111 }, { id:333 }]   ← id:222 is gone

        IMPORTANT: filter() does NOT modify the original array.
        It returns a BRAND NEW array. That's why we do: tasks = tasks.filter(...)
        We're replacing tasks with the filtered copy.
      */

      saveTasks();
      renderTasks();
    }, 290);
    /*
      290ms ≈ just after the 280ms CSS animation ends.
      By waiting, the user sees the smooth slide-out before the item disappears.
    */
  }
}


/* =============================================================
   SECTION 19: RENDER TASKS
   Clears the list and redraws every task from the tasks[] array.
   This is called the "re-render" pattern — simple but powerful.
   ============================================================= */

function renderTasks() {
  taskList.innerHTML = "";
  /*
    innerHTML = "" clears ALL child elements inside the task list.
    We start fresh every time renderTasks() is called.

    Then we rebuild from scratch using the tasks array.
    This is simpler than trying to update individual items in place.
  */

  // Update the "X / Y" counter in the header
  const doneCount = tasks.filter(t => t.done).length;
  /*
    tasks.filter(t => t.done)  → new array with only completed tasks
    .length                    → how many items in that array

    Example: tasks has 5 items, 2 are done
      doneCount = 2
  */
  taskCount.textContent = `${doneCount} / ${tasks.length}`;

  // Show empty state if there are no tasks
  if (tasks.length === 0) {
    const empty = document.createElement("div");
    /*
      document.createElement("div") creates a NEW <div> element.
      It's not on the page yet — it's just in memory.
      We need to append it to the DOM to make it visible.
    */
    empty.className   = "task-empty";
    empty.textContent = "✨ No tasks yet — add one above!";
    taskList.appendChild(empty);
    /*
      appendChild() adds the new element as the LAST CHILD of taskList.
      Now it appears on the page.
    */
    return; // Stop here — no tasks to render
  }

  // Build a DOM element for each task in the array
  tasks.forEach(task => {
    /*
      Array.forEach() loops through every item in the array.
      For each item, it runs the function once with that item as the argument.

      tasks.forEach(task => { ... })
      = "For each task in tasks, run this function with that task"
    */

    // --- Create the outer container div ---
    const item = document.createElement("div");
    item.className = "task-item" + (task.done ? " done" : "");
    /*
      Ternary: if task.done is true, add class "done", otherwise add nothing.
      Result: "task-item" or "task-item done"
    */
    item.dataset.id = task.id;
    /*
      element.dataset.id = value sets the HTML attribute data-id="value".
      We use this to identify WHICH task was clicked in deleteTask() and toggleTask().
      dataset is a built-in JS object that maps data-* attributes.
    */

    // --- Create the circular check button ---
    const checkBtn = document.createElement("button");
    checkBtn.className   = "task-check";
    checkBtn.textContent = task.done ? "✓" : "";
    /*
      If done: show ✓ inside the circle
      If not done: empty circle (the border is still visible via CSS)
    */
    checkBtn.addEventListener("click", () => toggleTask(task.id));
    /*
      addEventListener is the PROFESSIONAL way to attach event listeners.
      It's better than onclick="..." in HTML because:
        1. Keeps JS separate from HTML
        2. Can attach multiple listeners to one element
        3. Works inside loops correctly (each button gets the right task.id)

      "click" = listen for click events
      () => toggleTask(task.id) = arrow function that calls toggleTask with this task's id

      WHY arrow function here and not just toggleTask directly?
      If we wrote: addEventListener("click", toggleTask)
      → toggleTask would be called without an id argument — broken!
      We need: addEventListener("click", () => toggleTask(task.id))
      → Now when clicked, it calls toggleTask with the correct id.
    */

    // --- Create the text span ---
    const textSpan = document.createElement("span");
    textSpan.className   = "task-text";
    textSpan.textContent = task.text;
    /*
      Using .textContent (not .innerHTML) for user-typed text.
      WHY? SECURITY — textContent treats everything as plain text.
      If a user typed: <script>alert("hacked")</script>
        textContent → shows it as text (safe ✓)
        innerHTML   → would EXECUTE it as HTML (dangerous ✗)
      This is called XSS (Cross-Site Scripting) prevention.
    */

    // --- Create the PIN button (📌 — set this as current focus task) ---
    const pinBtn = document.createElement("button");
    pinBtn.className   = "task-pin" + (task.id === activeTaskId ? " pinned" : "");
    pinBtn.textContent = "📌";
    pinBtn.title       = task.id === activeTaskId ? "Unpin task" : "Focus on this task";
    /*
      task.id === activeTaskId → this is the currently pinned task → add class "pinned"
      CSS class "pinned" makes the button always visible (opacity: 1) with a pink glow.
      For all other tasks the button is hidden until hover.
    */
    pinBtn.addEventListener("click", () => setActiveTask(task.id));
    /*
      Clicking the pin button calls setActiveTask(task.id).
      If this task is already pinned, setActiveTask toggles it OFF.
      If another task was pinned, setActiveTask switches the pin to this one.
    */

    // --- Create the delete button ---
    const deleteBtn = document.createElement("button");
    deleteBtn.className   = "task-delete";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", () => deleteTask(task.id));

    // --- Assemble: check | text | pin | delete ---
    item.append(checkBtn, textSpan, pinBtn, deleteBtn);
    /*
      Order matters: pin button sits between the text and delete button.
      Both pin and delete are hidden until hover (CSS opacity: 0 → 1 on hover).
    */

    taskList.appendChild(item);
  });

  updateActiveTaskDisplay();
  /*
    Called at the end of every render so the 📌 bar above the timer
    always reflects the current tasks array state.
    (e.g. if the pinned task was just deleted, this hides the bar.)
  */
}


/* =============================================================
   SECTION 20: SAVE & LOAD TASKS (localStorage)
   ============================================================= */

function saveTasks() {
  localStorage.setItem("tasks", JSON.stringify(tasks));
  /*
    PROBLEM: localStorage only stores strings.
    Our tasks array is an OBJECT, not a string.

    SOLUTION: JSON.stringify() converts objects/arrays to a JSON string.

    JSON = JavaScript Object Notation — a standard text format for data.

    Example:
      tasks = [{ id: 111, text: "Study", done: false }]
      JSON.stringify(tasks)
      → '[{"id":111,"text":"Study","done":false}]'
      (the whole array becomes one long string)

    Now we can store it in localStorage.
  */
}

function loadTasks() {
  const saved = localStorage.getItem("tasks");

  if (saved !== null) {
    tasks = JSON.parse(saved);
    /*
      JSON.parse() is the REVERSE of JSON.stringify().
      It converts the JSON string BACK into a real JavaScript array/object.

      Example:
        saved = '[{"id":111,"text":"Study","done":false}]'
        JSON.parse(saved)
        → [{ id: 111, text: "Study", done: false }]

      Now tasks is a real array again, and we can use .push(), .filter() etc.
    */
  }

  renderTasks(); // Draw whatever tasks were loaded
}


/* =============================================================
   SECTION 21: KEYBOARD SHORTCUT — PRESS ENTER TO ADD TASK
   ============================================================= */

taskInput.addEventListener("keydown", function(event) {
  /*
    "keydown" fires every time the user presses a key while the input is focused.

    The browser passes an EVENT OBJECT to our function.
    We named it "event" (you'll also see it called "e" or "evt" — same thing).
    event.key = a string describing which key was pressed:
      "Enter" = Enter key
      "a"     = A key
      "Escape"= Escape key
  */
  if (event.key === "Enter") {
    addTask();
    /*
      If the user pressed Enter, add the task.
      This is a UX improvement — most users expect Enter to submit.
    */
  }
});


/* =============================================================
   SECTION 22: INITIALISE TASKS ON PAGE LOAD
   ============================================================= */

/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE D: MOTIVATIONAL QUOTES                  ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

const QUOTES = [
  "Focus is the bridge between goals and accomplishment.",
  "One task at a time. One moment at a time.",
  "Deep work is the superpower of the 21st century.",
  "The secret of getting ahead is getting started.",
  "Small progress is still progress. Keep going.",
  "Concentration is the root of all higher abilities.",
  "You don't have to be great to start. Start to become great.",
  "Your future self will thank you for this session.",
  "Eliminate the noise. Stay with the signal.",
  "This moment of focus is an investment in who you're becoming.",
  "Show up. Do the work. Trust the process.",
  "Every expert was once a beginner who refused to quit.",
  "Do the hard work, especially when you don't feel like it.",
  "Distraction is the enemy. Focus is the weapon.",
  "Not how long, but how well."
];
/*
  A plain array of strings — 15 motivational quotes.
  Math.random() * QUOTES.length picks a random index each time.
*/

function showQuote() {
  const index = Math.floor(Math.random() * QUOTES.length);
  /*
    Math.random() returns a decimal between 0 (inclusive) and 1 (exclusive).
    Multiply by the array length → random decimal in range [0, 15).
    Math.floor() rounds DOWN → whole number index in range [0, 14].
    So we can safely use it as an array index: QUOTES[0] to QUOTES[14].
  */
  statusMessage.textContent = `"${QUOTES[index]}"`;

  // Brief fade-in animation so the quote doesn't just snap in
  statusMessage.classList.add("quote-flash");
  setTimeout(() => statusMessage.classList.remove("quote-flash"), 500);
}


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE E: CONSECUTIVE DAY STREAK 🔥            ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

const streakCountEl = document.getElementById("streakCount");

function loadStreak() {
  const saved = localStorage.getItem("streakData");
  if (!saved) { updateStreakDisplay(); return; }

  const data = JSON.parse(saved);
  const today     = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1); // Go back 1 day
  const yesterdayStr = yesterday.toDateString();
  /*
    new Date() = right now.
    .setDate(.getDate() - 1) = subtract one day.
    .toDateString() = "Wed Jun 11 2026" format.

    WHY check yesterday? Because we want to know if the streak is ALIVE:
    - lastDate === today     → already studied today, streak is fine
    - lastDate === yesterday → studied yesterday, streak continues
    - anything older         → streak is broken, reset to 0
  */

  if (data.lastDate === today || data.lastDate === yesterdayStr) {
    streakCount = data.streak;
  } else {
    streakCount = 0; // Streak broken — missed at least one day
    data.streak = 0;
    localStorage.setItem("streakData", JSON.stringify(data));
  }

  updateStreakDisplay();
}

function checkStreak() {
  /*
    Called by incrementStats() each time a focus session ends.
    Only does something on the FIRST session of the day (pomodoroCount === 1),
    because that's when the new day is "unlocked" for the streak.
  */
  if (pomodoroCount !== 1) return;

  const today     = new Date().toDateString();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toDateString();

  const saved = localStorage.getItem("streakData");
  let data = saved ? JSON.parse(saved) : { lastDate: null, streak: 0 };

  if (data.lastDate === today) {
    return; // Already incremented today — don't double-count
  } else if (data.lastDate === yesterdayStr) {
    data.streak++; // Yesterday we studied too → consecutive days!
  } else {
    data.streak = 1; // Gap in streak → restart from 1
  }

  data.lastDate = today;
  localStorage.setItem("streakData", JSON.stringify(data));
  streakCount = data.streak;
  updateStreakDisplay();
}

function updateStreakDisplay() {
  streakCountEl.textContent = `🔥 × ${streakCount}`;

  if (streakCount > 0) {
    streakCountEl.classList.add("bump");
    setTimeout(() => streakCountEl.classList.remove("bump"), 350);
    /*
      Same bounce animation pattern as the 🍅 counter.
      Add class → wait 350ms → remove class.
      The CSS cubic-bezier spring easing makes it feel lively.
    */
  }
}


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE F: WEEKLY STATS CHART 📊                ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

function loadWeeklyStats() {
  const saved = localStorage.getItem("weeklyStats");
  if (saved) {
    weeklyData = JSON.parse(saved);
    /*
      weeklyData is an OBJECT where keys are date strings and values are counts:
        { "Mon Jun 09 2026": 3, "Tue Jun 10 2026": 5, "Thu Jun 12 2026": 1 }
      Missing dates just mean 0 sessions that day.
    */
  }
  renderWeeklyChart();
}

function saveWeeklyStats() {
  localStorage.setItem("weeklyStats", JSON.stringify(weeklyData));
}

function updateWeeklyStats() {
  /*
    Called by incrementStats() each time a focus session completes.
    We overwrite today's count with the current pomodoroCount.
    This keeps the chart perfectly in sync.
  */
  const today = new Date().toDateString();
  weeklyData[today] = pomodoroCount;
  saveWeeklyStats();
  renderWeeklyChart();
}

function renderWeeklyChart() {
  const ctx = weeklyChart.getContext("2d");
  /*
    .getContext("2d") returns the "2D drawing context" — the toolbox
    we use to draw shapes and text on the <canvas> element.
    Think of it as picking up a paintbrush.
  */

  // HiDPI / Retina fix: scale the canvas backing store to the device pixel ratio.
  // Without this, one CSS pixel = one canvas pixel, making the chart blurry on
  // retina displays (where one CSS pixel = 2 or 3 physical pixels).
  const dpr = window.devicePixelRatio || 1;
  const W = 296; // logical CSS pixels (matches the HTML width attribute)
  const H = 110;
  weeklyChart.width  = W * dpr;
  weeklyChart.height = H * dpr;
  ctx.scale(dpr, dpr);
  // CSS width: 100% in the stylesheet keeps the element the right visual size.

  ctx.clearRect(0, 0, W, H);
  /*
    clearRect(x, y, width, height) erases everything in that rectangle.
    We clear the whole canvas before every redraw to start fresh.
    Without this, old bars would show through the new ones.
  */

  // Build an array of the last 7 days, oldest first
  const DAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i); // Go back i days from today
    days.push({
      label: DAYS_SHORT[d.getDay()],  // "Mon", "Tue", etc.
      date:  d.toDateString(),        // "Thu Jun 12 2026"
      count: weeklyData[d.toDateString()] || 0
      /*
        weeklyData[date] = the count for that day.
        If the date isn't in weeklyData, it's undefined → || 0 gives us 0.
        || is the OR operator: "use the left value, unless it's falsy (0, null, undefined...)"
      */
    });
  }

  const today    = new Date().toDateString();
  const maxCount = Math.max(...days.map(d => d.count), 1);
  /*
    Math.max(...array) finds the highest number in the array.
    ...days.map(d => d.count) creates [3, 0, 5, 2, 0, 1, 4] — just the counts.
    The spread operator (...) unpacks the array into individual arguments.
    We include 1 as a fallback so maxCount is never 0 (avoids dividing by zero).
  */

  const labelH  = 16; // Height reserved for day labels at the bottom
  const barAreaH = H - labelH;
  const slotW    = W / 7; // Width per day slot

  days.forEach((day, i) => {
    const barW  = Math.floor(slotW * 0.55);        // Bar is 55% of slot width
    const barX  = i * slotW + (slotW - barW) / 2; // Centered within slot
    const barH  = day.count > 0
      ? Math.max(4, (day.count / maxCount) * (barAreaH - 14))
      : 2;
    /*
      Bar height = proportional to count relative to max.
      Math.max(4, ...) ensures even 1-count bars are at least 4px tall.
      barAreaH - 14 = leaves 14px of headroom above tallest bar for count labels.
      If count is 0, draw a 2px stub so the user can see "there was a day here".
    */
    const barY  = barAreaH - barH; // Bars grow upward from the bottom
    const isToday = (day.date === today);

    // Draw the bar
    ctx.fillStyle = isToday
      ? "rgba(224, 160, 168, 0.85)"  // Today: rose-pink (matches the app's accent)
      : "rgba(255, 255, 255, 0.18)"; // Past days: subtle white

    if (day.count > 0) {
      // Draw rounded-top rectangle using a path
      const r = 3; // corner radius in pixels
      ctx.beginPath();
      ctx.moveTo(barX + r, barY);
      ctx.lineTo(barX + barW - r, barY);
      ctx.quadraticCurveTo(barX + barW, barY, barX + barW, barY + r);
      ctx.lineTo(barX + barW, barAreaH);
      ctx.lineTo(barX, barAreaH);
      ctx.lineTo(barX, barY + r);
      ctx.quadraticCurveTo(barX, barY, barX + r, barY);
      ctx.closePath();
      ctx.fill();
      /*
        ctx.beginPath() starts a new shape.
        ctx.moveTo/lineTo/quadraticCurveTo draws the outline.
        ctx.closePath() connects back to the start.
        ctx.fill() fills the inside with fillStyle color.

        quadraticCurveTo(cpX, cpY, endX, endY) draws a curved line
        using a control point (cp). This rounds the top two corners.
      */
    } else {
      ctx.fillRect(barX, barAreaH - 2, barW, 2); // Flat 2px stub for zero days
    }

    // Count label above each bar
    if (day.count > 0) {
      ctx.fillStyle  = isToday ? "rgba(224, 160, 168, 1)" : "rgba(255,255,255,0.45)";
      ctx.font       = "bold 9px Quicksand, sans-serif";
      ctx.textAlign  = "center";
      ctx.fillText(day.count, barX + barW / 2, barY - 3);
    }

    // Day label at the bottom
    ctx.fillStyle = isToday ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.3)";
    ctx.font      = isToday
      ? "bold 10px Quicksand, sans-serif"
      : "10px Quicksand, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(day.label, barX + barW / 2, H - 2);
  });

  // Update the "N sessions" badge in the card header
  const weekSum = days.reduce((sum, d) => sum + d.count, 0);
  /*
    Array.reduce() runs a function on every item and accumulates a result.
    (sum, d) => sum + d.count starts with sum = 0, then adds each count.
    Result: the total number of sessions across all 7 days.
  */
  weekTotal.textContent = `${weekSum} session${weekSum !== 1 ? "s" : ""}`;
  /*
    weekSum !== 1 ? "s" : ""  → "sessions" (plural) or "session" (singular)
    This is a small but polished UX detail.
  */
}


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║   FEATURE G: AMBIENT SOUNDS — HTML5 Audio + MP3          ║
   ╚══════════════════════════════════════════════════════════╝
   Local MP3 files play as background music using the browser's
   built-in <audio> element — no third-party API, no ads, works offline.

   Files expected in the sounds/ subfolder:
     sounds/ocean.mp3   sounds/rain.mp3   sounds/forest.mp3
     sounds/lofi.mp3    sounds/jazz1.mp3  sounds/jazz2.mp3
   ============================================================= */

// ─── Track metadata: file path + display info ────────────────
const AUDIO_TRACKS = {
  ocean:  { src: "sounds/ocean.mp3",  emoji: "🌊", name: "海浪声"      },
  rain:   { src: "sounds/rain.mp3",   emoji: "🌧", name: "钢琴 + 雨水" },
  forest: { src: "sounds/forest.mp3", emoji: "🌲", name: "钢琴 + 森林" },
  lofi:   { src: "sounds/lofi.mp3",   emoji: "🎵", name: "Lo-fi music" },
  jazz1:  { src: "sounds/jazz1.mp3",  emoji: "🎷", name: "Jazz mix 1"  },
  jazz2:  { src: "sounds/jazz2.mp3",  emoji: "🎸", name: "Jazz mix 2"  },
};

// One shared Audio element — we swap its src to change tracks.
// Reusing one element avoids creating/destroying audio contexts on every switch.
const audioEl = new Audio();
audioEl.loop = true; // each track loops automatically until the user stops it

// ─── Update progress bar + current-time label as the track plays ──
audioEl.ontimeupdate = function () {
  if (!audioEl.duration) return; // metadata not loaded yet — skip

  /*
    audioEl.currentTime = how many seconds have played so far
    audioEl.duration    = total length of the track in seconds
    pct = percentage of the track that has played → bar width
  */
  const pct = (audioEl.currentTime / audioEl.duration) * 100;
  document.getElementById("audioProgressBar").style.width = pct + "%";
  document.getElementById("audioCurrentTime").textContent =
    formatAudioTime(audioEl.currentTime);
};

// ─── Show the total track length once the browser has read the file ──
audioEl.onloadedmetadata = function () {
  document.getElementById("audioTotalTime").textContent =
    formatAudioTime(audioEl.duration);
};

// ─── Convert raw seconds into "m:ss" string (e.g. 90 → "1:30") ──
function formatAudioTime(secs) {
  /*
    Math.floor(secs / 60)  → whole minutes
    Math.floor(secs % 60)  → remaining seconds
    padStart(2, "0")       → ensures "1:05" not "1:5"
  */
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

// ─── Toggle play / pause for the current track ───────────────────
function toggleAudioPlayback() {
  if (audioEl.paused) {
    audioEl.play().catch(() => {});
  } else {
    audioEl.pause();
  }
}

// Keep the button icon in sync with the actual audio state
audioEl.onplay = function () {
  const btn = document.getElementById("audioPauseBtn");
  if (btn) btn.textContent = "⏸";
};
audioEl.onpause = function () {
  const btn = document.getElementById("audioPauseBtn");
  if (btn) btn.textContent = "▶";
};

// ─── Seek when user clicks anywhere on the progress track ────────
function seekAudio(event) {
  /*
    getBoundingClientRect() returns the pixel position of the bar on screen.
    (event.clientX - rect.left) = how many pixels from the left edge the user clicked.
    Dividing by the bar's total width gives a 0–1 fraction.
    Multiplying by duration converts that fraction to a time in seconds.
  */
  if (!audioEl.duration) return;
  const bar  = event.currentTarget;
  const rect = bar.getBoundingClientRect();
  const pct  = (event.clientX - rect.left) / rect.width;
  audioEl.currentTime = Math.max(0, Math.min(1, pct)) * audioEl.duration;
}

// ─── Master switch — called by all 7 sound buttons ────────────
function setAmbient(type) {
  /*
    Every time the user clicks a sound button:
      1. Save state, update button highlights, persist to localStorage.
      2a. "off" → pause and clear the audio, hide the player panel.
      2b. Any track → reveal the panel, update the track label,
          load the MP3 if it's different from what's currently loaded,
          then play.
  */
  ambientType = type;
  updateAmbientButtons();
  localStorage.setItem("ambientPreference", type);

  const player = document.getElementById("audioPlayer");

  if (type === "off") {
    audioEl.pause();
    audioEl.src = "";
    // Reset the progress bar and time labels back to zero
    document.getElementById("audioProgressBar").style.width = "0%";
    document.getElementById("audioCurrentTime").textContent = "0:00";
    document.getElementById("audioTotalTime").textContent   = "0:00";
    player.classList.remove("active");
    return;
  }

  const track = AUDIO_TRACKS[type];
  player.classList.add("active");

  // Update the emoji and track name shown in the player header
  document.getElementById("audioEmoji").textContent = track.emoji;
  document.getElementById("audioName").textContent  = track.name;

  // Only change the src if we're switching to a DIFFERENT track.
  // If the user clicks the same button twice, we keep playback position.
  const fullSrc = new URL(track.src, location.href).href;
  if (audioEl.src !== fullSrc) {
    audioEl.src = track.src;
  }

  // .play() returns a Promise — .catch() silently handles the case where
  // the browser blocks autoplay (requires a prior user gesture).
  audioEl.play().catch(() => {});
}

function updateAmbientButtons() {
  /*
    Loop through all 7 button IDs and match each to its type string.
    Toggle class "active" ON for the selected button, OFF for the rest.
    "active" = pink glow border (see CSS .btn-ambient.active).
  */
  const types = ["off",         "ocean",       "rain",       "forest",
                 "lofi",        "jazz1",       "jazz2"];
  const ids   = ["ambientOff",  "ambientOcean","ambientRain","ambientForest",
                 "ambientLofi", "ambientJazz1","ambientJazz2"];
  ids.forEach((id, i) => {
    const btn = document.getElementById(id);
    if (btn) btn.classList.toggle("active", ambientType === types[i]);
  });
}

function loadAmbientPreference() {
  /*
    Restore the user's last-used sound choice from localStorage.
    We only restore the button highlight — we do NOT auto-play,
    because browsers require a user gesture before playing audio.
    The user just clicks the same button again to resume.

    Migration map: old type names → current names, so returning users
    don't get broken state from a previous version of the app.
  */
  const saved = localStorage.getItem("ambientPreference") || "off";
  const migrate = {
    white: "off", cafe: "off",
    jazz: "jazz1", classical: "jazz2",
    ocean: "ocean", rain: "rain", forest: "forest",
    lofi: "lofi", jazz1: "jazz1", jazz2: "jazz2", off: "off",
  };
  ambientType = migrate[saved] ?? "off";
  updateAmbientButtons();
}


/* =============================================================
   ╔══════════════════════════════════════════════════════════╗
   ║          FEATURE H: ACTIVE TASK BINDING 📌               ║
   ╚══════════════════════════════════════════════════════════╝
   ============================================================= */

function setActiveTask(id) {
  if (activeTaskId === id) {
    activeTaskId = null; // Clicking the same pin again = unpin
  } else {
    activeTaskId = id;   // Pin this task
  }
  renderTasks();             // Re-draw so pinned button style updates
  updateActiveTaskDisplay(); // Show/hide the bar above the timer
}

function clearActiveTask() {
  activeTaskId = null;
  updateActiveTaskDisplay();
  renderTasks(); // Re-render so the old pinned button loses its "pinned" style
}

function updateActiveTaskDisplay() {
  if (activeTaskId !== null) {
    const task = tasks.find(t => t.id === activeTaskId);
    if (task && !task.done) {
      activeTaskText.textContent = task.text;
      activeTaskDisplay.classList.add("visible");
      /*
        CSS class "visible" switches display from "none" to "flex",
        revealing the 📌 bar with the task name.
      */
      return;
    }
    // Task was deleted or already done — auto-clear the pin
    activeTaskId = null;
  }
  activeTaskDisplay.classList.remove("visible"); // Hide the bar
}


/* =============================================================
   FULLSCREEN
   ─────────────────────────────────────────────────────────────
   The browser Fullscreen API lets any element (or the whole page)
   fill the entire screen, hiding the browser's address bar and tabs.

   document.documentElement = the <html> element (root of the page).
   requestFullscreen() on <html> = the entire page goes fullscreen,
   including our body gradient, break-mode colors, and all cards.
   The CSS :fullscreen selector then reshapes the layout (hides task
   list, makes timer huge, etc.).

   WHY not call requestFullscreen() on .card directly?
   If we fullscreen just the card, its background would be white
   (default browser fullscreen background). By fullscreening <html>,
   the body's gradient background fills the whole screen correctly.
   ============================================================= */

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    /*
      document.fullscreenElement is null when nothing is fullscreen.
      Requesting fullscreen on documentElement (= <html>) makes the
      ENTIRE page go fullscreen — body gradient, cards, everything.
    */
    document.documentElement.requestFullscreen().catch(err => {
      console.log("Fullscreen request failed:", err.message);
      // May fail if the browser blocks the request (e.g. missing user gesture)
    });
  } else {
    document.exitFullscreen(); // Return to normal browser window
  }
}

// Update the SVG icon when fullscreen state changes
document.addEventListener("fullscreenchange", () => {
  const isFS = !!document.fullscreenElement; // true = currently fullscreen
  const path  = document.querySelector("#iconFullscreen path");
  if (!path) return;

  if (isFS) {
    // Compress icon: four inward-pointing corners → "click to EXIT fullscreen"
    path.setAttribute("d", "M4 1V4H1M13 4H10V1M10 13V10H13M1 10H4V13");
    btnFullscreen.title = "退出全屏";
  } else {
    // Expand icon: four outward-pointing corners → "click to GO fullscreen"
    path.setAttribute("d", "M1 5V1H5M9 1H13V5M13 9V13H9M5 13H1V9");
    btnFullscreen.title = "全屏专注";
  }
  /*
    How the SVG path commands work (a crash course):
      M x y   = Move to (x,y) without drawing
      H x     = draw Horizontal line to x
      V y     = draw Vertical line to y
    The expand path draws 4 corner brackets pointing outward.
    The compress path draws 4 corner brackets pointing inward.
  */
});


/* =============================================================
   PAGE LOAD SEQUENCE
   All variables and functions are fully declared above this point.
   Now we run the startup code in the correct order.

   WHY move this to the bottom?
   JavaScript const/let variables are NOT available before the line
   where they are declared (this is called the "Temporal Dead Zone").
   If we call loadStats() before pomodoroCountEl is declared, the
   browser throws a ReferenceError and the ENTIRE script crashes —
   meaning nothing works: no tasks, no keyboard shortcuts, nothing.
   Putting all init calls here, after every declaration, avoids that.
   ============================================================= */

loadSettings();          // 1. Read saved focus/break/long-break times from localStorage
initialise();            // 2. Draw the timer display (needs step 1 first)
initNotifications();     // 3. Re-enable 🔔 bell if browser permission was already granted
showNotifPrompt();       // 4. Show in-app permission banner if user hasn't decided yet
loadStats();             // 5. Draw today's 🍅 × N count
loadStreak();            // 6. Draw 🔥 streak counter
loadWeeklyStats();       // 7. Draw the 7-day bar chart
loadAmbientPreference(); // 7. Resume ambient sound if user had one selected
loadTasks();             // 8. Draw saved task list (must be last — renderTasks calls updateActiveTaskDisplay)
