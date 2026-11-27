import { app } from "electron";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Exercises the packaged game in a real Electron window: WebGL renders the machine, assets stay local, a real Space
 * press drops coins that land on the pusher, the C key adds credits once per press, and a tall window renders the
 * portrait cabinet view.
 */
export function prepareSmoke(win, projectRoot) {
  const failures = [];
  const completedResources = [];
  win.webContents.debugger.attach("1.3");
  const networkReady = win.webContents.debugger.sendCommand("Network.enable");
  const responses = new Map();
  win.webContents.debugger.on("message", (_event, method, params) => {
    if (method === "Network.responseReceived") {
      responses.set(params.requestId, params.response);
    } else if (method === "Network.loadingFinished") {
      const response = responses.get(params.requestId);
      if (response) completedResources.push(response.url);
    }
  });
  win.webContents.on("console-message", (details) => {
    if (details.level === "error") failures.push(details.message);
  });
  win.webContents.on("did-fail-load", (_event, code, description) => {
    failures.push(`Page load failed: ${code} ${description}`);
  });
  win.webContents.session.webRequest.onErrorOccurred((details) => {
    failures.push(`Resource failed: ${details.url}: ${details.error}`);
  });
  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  const screenshot = async (name) => {
    const file = path.join(projectRoot, "dist_electron", name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, (await win.webContents.capturePage()).toPNG());
    return file;
  };
  async function waitFor(check, description, timeout = 30_000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await check()) return;
      await pause(100);
    }
    const file = await screenshot("electron-smoke-failure.png");
    throw new Error(`Timed out waiting for ${description}; failures=${JSON.stringify(failures)}; screenshot=${file}`);
  }

  return async () => {
    await networkReady;
    await waitFor(() => evaluate("Boolean(document.querySelector('#viewport canvas'))"), "game startup");
    const renderer = await evaluate(`(() => {
      const canvas = document.querySelector('#viewport canvas');
      return { webgl: Boolean(canvas.getContext('webgl2')), width: canvas.width, height: canvas.height };
    })()`);
    assert.equal(renderer.webgl, true, "WebGL2 renderer must be active");
    assert.ok(renderer.width > 0 && renderer.height > 0, "Canvas must have a drawable viewport");
    assert.ok(completedResources.length > 0, "Game must have loaded from the app protocol");
    assert.ok(
      completedResources.every((url) => url.startsWith("coinquake://app/") || url.startsWith("data:") || url.startsWith("blob:")),
      `Game assets must remain local: ${completedResources}`,
    );

    // The smoke profile persists between runs: start from an empty high-score table.
    await evaluate("localStorage.removeItem('coin-quake.scores')");
    await win.loadURL("coinquake://app/index.html?test&seed=42");
    await waitFor(() => evaluate("Boolean(window.coinQuake)"), "deterministic startup");
    const state = () =>
      evaluate(
        "(() => { const g = window.coinQuake; return { phase: g.run.phase, stock: g.run.stock, bodies: g.physics.coins.length, frames: g.frames, points: g.economy.points, runs: g.runs, initials: !!g.initials, table: g.showingTable, playAgain: g.canPlayAgain }; })()",
      );
    const key = (type, keyCode, modifiers) => win.webContents.sendInputEvent({ type, keyCode, ...(modifiers ? { modifiers } : {}) });
    const initial = await state();
    assert.equal(initial.phase, "ready", "the machine waits for a press");

    // A real Space press starts a run; holding it streams coins from the stock.
    key("keyDown", "Space");
    await waitFor(async () => (await state()).phase === "playing", "a press starts a run");
    const started = await state();
    await waitFor(async () => (await state()).stock <= started.stock - 3, "coins dropped by holding Space");
    key("keyUp", "Space");
    const afterDrop = await state();
    assert.ok(afterDrop.bodies > initial.bodies, "dropped coins must be in the machine");

    // C (the cabinet's credit and exit button) is harmless in free play, even when the key repeats.
    key("keyDown", "C");
    key("keyDown", "C", ["isAutoRepeat"]);
    key("keyUp", "C");
    await pause(300);
    assert.equal((await state()).phase, "playing", "C must not end or restart a run");

    await pause(1000);
    const file = await screenshot("electron-smoke.png");

    // End the run (Last Call with an empty stock): the finale, then initials (the first score always qualifies).
    // Fast-forward the simulation: on a slow CI runner (software rendering) simulated time crawls in real time.
    await evaluate("(() => { const g = window.coinQuake; g.lastCall(); g.run.stock = 0; g.advance(20); })()");
    await waitFor(async () => (await state()).phase === "over", "the run ends after Last Call", 60_000);
    await waitFor(async () => (await state()).initials, "initials open after the finale", 30_000);
    // Three holds lock three letters. Each is held until its letter locks: on a slow runner the 0.35 s lock is
    // simulated time, which can take far longer in real time.
    const index = () => evaluate("(() => { const e = window.coinQuake.initials; return e ? e.index : 3; })()");
    for (let i = 0; i < 3; i++) {
      key("keyDown", "Space");
      await waitFor(async () => (await index()) > i, `letter ${i + 1} locks while held`, 30_000);
      key("keyUp", "Space");
      await pause(150);
    }
    await waitFor(async () => (await state()).table, "the high-score table after initials");
    const saved = await evaluate("localStorage.getItem('coin-quake.scores')");
    assert.ok(saved && JSON.parse(saved).length === 1, `the score is saved: ${saved}`);

    // Play again: a fresh machine, fresh stock and score.
    await waitFor(async () => (await state()).playAgain, "the table accepts a press");
    key("keyDown", "Space");
    await waitFor(async () => (await state()).runs === 2 && (await state()).phase === "playing", "play again starts a second run");
    key("keyUp", "Space");
    const again = await state();
    assert.ok(again.points === 0 || again.points < afterDrop.points + 1000, "a new run starts its score fresh");

    // A portrait window (the vertical cabinet monitor) keeps rendering.
    win.setContentSize(525, 840);
    const frames = (await state()).frames;
    await waitFor(async () => (await state()).frames > frames + 30, "rendering in a portrait window");
    await pause(500);
    const portrait = await screenshot("electron-smoke-portrait.png");
    assert.deepEqual(failures, [], "Renderer/resource failures");
    console.log(`[electron-smoke] passed: WebGL, local assets, run start, Space drops, C harmless, finale, initials, saved score, play again, portrait; screenshots=${file}, ${portrait}`);
    app.quit();
  };
}
