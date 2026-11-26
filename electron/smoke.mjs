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

    await win.loadURL("coinquake://app/index.html?test&seed=42");
    await waitFor(() => evaluate("Boolean(window.coinQuake)"), "deterministic startup");
    const state = () => evaluate("(() => { const g = window.coinQuake; return { coins: g.economy.coins, bodies: g.physics.coins.length, frames: g.frames }; })()");
    const initial = await state();

    // Real keyboard: hold Space to stream coins, release to stop.
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "Space" });
    await waitFor(async () => (await state()).coins <= initial.coins - 3, "coins dropped by holding Space");
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "Space" });
    const afterDrop = await state();
    assert.ok(afterDrop.bodies > initial.bodies, "dropped coins must be in the machine");

    // C adds one credit batch per press, even when the key repeats.
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "C" });
    win.webContents.sendInputEvent({ type: "keyDown", keyCode: "C", modifiers: ["isAutoRepeat"] });
    win.webContents.sendInputEvent({ type: "keyUp", keyCode: "C" });
    await waitFor(async () => (await state()).coins >= afterDrop.coins + 50, "credit added by C");
    const afterCredit = await state();
    assert.ok(afterCredit.coins < afterDrop.coins + 100, "a repeated C key must not add a second batch");

    await pause(1000);
    const file = await screenshot("electron-smoke.png");

    // A portrait window (the vertical cabinet monitor) keeps rendering.
    win.setContentSize(525, 840);
    const frames = (await state()).frames;
    await waitFor(async () => (await state()).frames > frames + 30, "rendering in a portrait window");
    await pause(500);
    const portrait = await screenshot("electron-smoke-portrait.png");
    assert.deepEqual(failures, [], "Renderer/resource failures");
    console.log(`[electron-smoke] passed: WebGL, local assets, Space drops, C credit, portrait; screenshots=${file}, ${portrait}`);
    app.quit();
  };
}
