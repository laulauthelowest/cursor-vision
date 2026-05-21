import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────
const mockCtx = {
  clearRect: vi.fn(), fillRect: vi.fn(), beginPath: vi.fn(),
  arc: vi.fn(), fill: vi.fn(),
  createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  globalCompositeOperation: "source-over", globalAlpha: 1.0,
  fillStyle: "", filter: "none",
};

const mockCanvasEl = {
  id: "", style: { cssText: "" }, width: 800, height: 600,
  getContext: vi.fn(() => mockCtx), remove: vi.fn(),
};

function makeFoundryMock({ isGM = false, sceneEnabled = false, userConfig = {} } = {}) {
  const config = userConfig;
  global.game = {
    user: { isGM, id: "user1" },
    users: { filter: vi.fn(() => []) },
    settings: {
      get:      vi.fn((_, key) => key === "sceneConfig" ? config : undefined),
      set:      vi.fn(),
      register: vi.fn(),
    },
    socket: { on: vi.fn(), emit: vi.fn() },
  };
  global.canvas = {
    ready: true,
    stage: { on: vi.fn(), off: vi.fn(), transform: { worldTransform: { a: 1, d: 1, tx: 0, ty: 0 } } },
    app:   { view: { clientWidth: 800, clientHeight: 600, addEventListener: vi.fn(), removeEventListener: vi.fn() } },
    scene: {
      id: "scene1",
      getFlag: vi.fn((_, key) => key === "enabled" ? sceneEnabled : null),
      setFlag: vi.fn(),
    },
  };
  global.ui = { controls: { render: vi.fn() }, notifications: { info: vi.fn() } };
  global.Hooks = { once: vi.fn(), on: vi.fn() };
  global.foundry = { utils: { mergeObject: vi.fn((a, b) => ({ ...a, ...b })), hasProperty: vi.fn(() => true) } };
  global.document = {
    createElement: vi.fn(() => ({ ...mockCanvasEl })),
    querySelector:  vi.fn(() => null),
    getElementById: vi.fn(() => ({ appendChild: vi.fn() })),
    body: { appendChild: vi.fn() },
  };
  global.requestAnimationFrame = vi.fn(() => 42);
  global.cancelAnimationFrame  = vi.fn();
  global.$                     = vi.fn(() => ({ on: vi.fn(), find: vi.fn(() => ({ on: vi.fn(), prop: vi.fn(), each: vi.fn(), val: vi.fn(), show: vi.fn(), hide: vi.fn(), closest: vi.fn(() => ({ find: vi.fn(() => ({ hide: vi.fn(), show: vi.fn() })) })) })), prop: vi.fn(), data: vi.fn() }));
}

// ── Profile ──────────────────────────────────────────────────────────────────
const PROFILES = {
  none:        { label: "Kein Licht",    icon: "💀", radius: 0,   softEdge: true,  opacity: 1.00, flicker: false, grayscale: false },
  candle:      { label: "Teelicht",      icon: "🕯️", radius: 80,  softEdge: true,  opacity: 0.95, flicker: false, grayscale: false },
  torch:       { label: "Fackel",        icon: "🔥", radius: 130, softEdge: true,  opacity: 0.90, flicker: true,  grayscale: false },
  lantern:     { label: "Laterne",       icon: "🪔", radius: 250, softEdge: true,  opacity: 0.85, flicker: false, grayscale: false },
  flashlight:  { label: "Taschenlampe",  icon: "🔦", radius: 180, softEdge: false, opacity: 1.00, flicker: false, grayscale: false },
  nightvision: { label: "Nachtsicht",    icon: "👁️", radius: 350, softEdge: true,  opacity: 0.60, flicker: false, grayscale: true  },
  follow:      { label: "Folgt Spieler", icon: "👣", radius: 0,   softEdge: true,  opacity: 0.90, flicker: false, grayscale: false },
};

class CursorVision {
  static _canvas = null; static _ctx = null; static _animId = null;
  static _mouse = { x: -999, y: -999, onStage: false };
  static _followMouse = { x: -999, y: -999 };
  static _mouseMoveHandler = null; static _mouseLeaveHandler = null;
  static _flickerOffset = 0;

  static getConfig()  { return game.settings.get("cursor-vision", "sceneConfig") ?? {}; }
  static async setConfig(c) { await game.settings.set("cursor-vision", "sceneConfig", c); game.socket.emit("module.cursor-vision", { type: "configUpdate" }); }
  static isSceneEnabled() { return canvas?.scene?.getFlag("cursor-vision", "enabled") ?? false; }
  static async setSceneEnabled(a) { await canvas.scene.setFlag("cursor-vision", "enabled", a); }
  static getMyConfig() { return this.getConfig()[game.user.id] ?? { profile: "none", followId: "" }; }
  static getMyProfile() { return PROFILES[this.getMyConfig().profile] ?? PROFILES.none; }

  static onSocket(data) {
    if (data.type === "mousePos") {
      const myConf = this.getMyConfig();
      if (myConf.profile === "follow" && myConf.followId === data.userId) {
        this._followMouse = { x: data.x, y: data.y };
      }
    }
  }

  static get isActive() {
    if (!canvas?.ready) return false;
    if (game.user.isGM) return false;
    return this.isSceneEnabled();
  }

  static refresh() { if (this.isActive) this._activate(); else this._deactivate(); }

  static _activate() {
    if (this._canvas) return;
    const parent = document.getElementById("board") ?? document.body;
    this._canvas = document.createElement("canvas");
    this._ctx = this._canvas.getContext("2d");
    parent.appendChild(this._canvas);
    this._mouseMoveHandler  = () => {};
    this._mouseLeaveHandler = () => { this._mouse.onStage = false; };
    canvas.stage.on("mousemove", this._mouseMoveHandler);
    canvas.app.view.addEventListener("mouseleave", this._mouseLeaveHandler);
    const loop = () => { this._draw(); this._animId = requestAnimationFrame(loop); };
    this._animId = requestAnimationFrame(loop);
  }

  static _deactivate() {
    if (!this._canvas) return;
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    canvas.stage?.off("mousemove", this._mouseMoveHandler);
    canvas.app?.view?.removeEventListener("mouseleave", this._mouseLeaveHandler);
    this._mouseMoveHandler = null; this._mouseLeaveHandler = null;
    this._canvas.remove(); this._canvas = null; this._ctx = null;
  }

  static _draw() {
    if (!this._canvas || !this._ctx) return;
    const view = canvas.app.view;
    if (this._canvas.width  !== view.clientWidth)  this._canvas.width  = view.clientWidth;
    if (this._canvas.height !== view.clientHeight) this._canvas.height = view.clientHeight;
    const W = this._canvas.width, H = this._canvas.height;
    const ctx = this._ctx;
    const myConf  = this.getMyConfig();
    const profile = PROFILES[myConf.profile] ?? PROFILES.none;
    const isFollowing = myConf.profile === "follow";
    const mx = isFollowing ? this._followMouse.x : this._mouse.x;
    const my = isFollowing ? this._followMouse.y : this._mouse.y;
    const hasPos = mx > -900;
    let radius = profile.radius;
    if (profile.flicker) {
      this._flickerOffset += 0.08;
      radius = Math.max(40, radius + Math.sin(this._flickerOffset * 1.7) * 6);
    }
    ctx.clearRect(0, 0, W, H);
    ctx.filter = profile.grayscale ? "grayscale(1)" : "none";
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = profile.opacity;
    ctx.fillStyle = profile.grayscale ? "#888888" : "#000000";
    ctx.fillRect(0, 0, W, H);
    if (profile.radius === 0 || !hasPos) return;
    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";
    if (!profile.softEdge) {
      ctx.beginPath(); ctx.arc(mx, my, radius, 0, Math.PI * 2); ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radius);
      grad.addColorStop(0, "rgba(0,0,0,1)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(mx, my, radius, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = "source-over"; ctx.globalAlpha = 1.0;
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────
beforeEach(() => {
  CursorVision._canvas = null; CursorVision._ctx = null; CursorVision._animId = null;
  CursorVision._mouse = { x: -999, y: -999, onStage: false };
  CursorVision._followMouse = { x: -999, y: -999 };
  CursorVision._mouseMoveHandler = null; CursorVision._mouseLeaveHandler = null;
  CursorVision._flickerOffset = 0;
  vi.clearAllMocks();
});

describe("Profile", () => {
  it("alle 7 Profile sind definiert", () => expect(Object.keys(PROFILES)).toHaveLength(7));
  it("nur Fackel flackert", () => expect(Object.entries(PROFILES).filter(([,p]) => p.flicker).map(([k]) => k)).toEqual(["torch"]));
  it("nur Nachtsicht hat grayscale", () => expect(Object.entries(PROFILES).filter(([,p]) => p.grayscale).map(([k]) => k)).toEqual(["nightvision"]));
  it("none und follow haben radius 0", () => { expect(PROFILES.none.radius).toBe(0); expect(PROFILES.follow.radius).toBe(0); });
});

describe("getMyConfig", () => {
  it("gibt none zurück wenn kein Config-Eintrag", () => {
    makeFoundryMock({ userConfig: {} });
    expect(CursorVision.getMyConfig().profile).toBe("none");
  });
  it("gibt korrektes Profil zurück", () => {
    makeFoundryMock({ userConfig: { user1: { profile: "torch", followId: "" } } });
    expect(CursorVision.getMyConfig().profile).toBe("torch");
  });
});

describe("isActive", () => {
  it("false wenn GM", () => { makeFoundryMock({ isGM: true, sceneEnabled: true }); expect(CursorVision.isActive).toBe(false); });
  it("false wenn Szene deaktiviert", () => { makeFoundryMock({ sceneEnabled: false }); expect(CursorVision.isActive).toBe(false); });
  it("true für Spieler wenn Szene aktiv", () => { makeFoundryMock({ sceneEnabled: true }); expect(CursorVision.isActive).toBe(true); });
});

describe("onSocket – Follow-Modus", () => {
  it("aktualisiert followMouse wenn gefolgter Spieler Position sendet", () => {
    makeFoundryMock({ userConfig: { user1: { profile: "follow", followId: "user2" } } });
    CursorVision.onSocket({ type: "mousePos", userId: "user2", x: 300, y: 400 });
    expect(CursorVision._followMouse).toEqual({ x: 300, y: 400 });
  });
  it("ignoriert Position von anderem Spieler", () => {
    makeFoundryMock({ userConfig: { user1: { profile: "follow", followId: "user2" } } });
    CursorVision.onSocket({ type: "mousePos", userId: "user3", x: 300, y: 400 });
    expect(CursorVision._followMouse).toEqual({ x: -999, y: -999 });
  });
});

describe("_draw", () => {
  it("zeichnet nichts ohne canvas", () => { makeFoundryMock(); CursorVision._draw(); expect(mockCtx.clearRect).not.toHaveBeenCalled(); });
  it("zeichnet keine Loch bei Profil none", () => {
    makeFoundryMock({ sceneEnabled: true, userConfig: { user1: { profile: "none" } } });
    CursorVision._activate(); CursorVision._mouse = { x: 200, y: 300, onStage: true };
    vi.clearAllMocks(); CursorVision._draw();
    expect(mockCtx.arc).not.toHaveBeenCalled();
  });
  it("setzt grayscale Filter für Nachtsicht", () => {
    makeFoundryMock({ sceneEnabled: true, userConfig: { user1: { profile: "nightvision" } } });
    CursorVision._activate(); CursorVision._mouse = { x: 200, y: 300, onStage: true };
    vi.clearAllMocks(); CursorVision._draw();
    expect(mockCtx.filter).toBe("none"); // nach destination-out zurückgesetzt
  });
  it("nutzt followMouse Position wenn Follow-Modus", () => {
    makeFoundryMock({ sceneEnabled: true, userConfig: { user1: { profile: "follow", followId: "user2" } } });
    CursorVision._activate();
    CursorVision._followMouse = { x: 500, y: 600 };
    vi.clearAllMocks(); CursorVision._draw();
    // radius ist 0 für follow → kein arc
    expect(mockCtx.arc).not.toHaveBeenCalled();
  });
});

describe("_activate / _deactivate", () => {
  it("erstellt canvas", () => { makeFoundryMock(); CursorVision._activate(); expect(CursorVision._canvas).not.toBeNull(); });
  it("deaktiviert sauber", () => {
    makeFoundryMock(); CursorVision._activate();
    const el = CursorVision._canvas; CursorVision._deactivate();
    expect(el.remove).toHaveBeenCalled(); expect(CursorVision._canvas).toBeNull();
  });
});
