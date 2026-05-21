/**
 * Cursor Vision – FoundryVTT Module v2
 * Kompatibel mit V14+
 *
 * Features:
 * - GM-Fenster zur Verwaltung pro Spieler
 * - Lichtquellen-Profile pro Spieler
 * - "Folgt Spieler X" Modus
 * - Schwarzweiß-Filter außerhalb der Lichtquelle
 * - Mausposition-Sync via Foundry Sockets
 */

const MODULE_ID = "cursor-vision";

// ── Profile ──────────────────────────────────────────────────────────────────
const PROFILES = {
  none:        { label: "Kein Licht",      icon: "💀", radius: 0,   softEdge: true,  opacity: 1.00, flicker: false, grayscale: false },
  candle:      { label: "Teelicht",        icon: "🕯️", radius: 80,  softEdge: true,  opacity: 0.95, flicker: false, grayscale: false },
  torch:       { label: "Fackel",          icon: "🔥", radius: 130, softEdge: true,  opacity: 0.90, flicker: true,  grayscale: false },
  lantern:     { label: "Laterne",         icon: "🪔", radius: 250, softEdge: true,  opacity: 0.85, flicker: false, grayscale: false },
  flashlight:  { label: "Taschenlampe",    icon: "🔦", radius: 180, softEdge: false, opacity: 1.00, flicker: false, grayscale: false },
  nightvision: { label: "Nachtsicht",      icon: "👁️", radius: 350, softEdge: true,  opacity: 0.60, flicker: false, grayscale: true  },
  follow:      { label: "Folgt Spieler…",  icon: "👣", radius: 0,   softEdge: true,  opacity: 0.90, flicker: false, grayscale: false },
};
const PROFILE_KEYS = Object.keys(PROFILES);

// ── Socket-Nachrichten ───────────────────────────────────────────────────────
const SOCKET_ID = `module.${MODULE_ID}`;

// ── Einstellungen ────────────────────────────────────────────────────────────
Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "sceneConfig", {
    scope: "world", config: false, type: Object, default: {}
  });

  // Socket registrieren
  game.socket.on(SOCKET_ID, (data) => CursorVision.onSocket(data));
});

// ── Toolbar-Button (V14) ─────────────────────────────────────────────────────
Hooks.on("getSceneControlButtons", (controls) => {
  if (!game.user.isGM) return;

  controls.push({
    name:    MODULE_ID,
    title:   "Cursor Vision",
    icon:    "fas fa-eye-slash",
    layer:   "controls",
    visible: true,
    tools:   [
      {
        name:    "toggle",
        title:   "Cursor Vision an/aus",
        icon:    "fas fa-eye-slash",
        toggle:  true,
        active:  CursorVision.isSceneEnabled(),
        onClick: (active) => {
          CursorVision.setSceneEnabled(active);
        }
      },
      {
        name:    "settings",
        title:   "Spieler-Einstellungen",
        icon:    "fas fa-users-cog",
        button:  true,
        onClick: () => CursorVision.openSettings()
      }
    ]
  });
});

// ── GM-Einstellungsfenster ───────────────────────────────────────────────────
class CursorVisionSettings extends FormApplication {
  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id:       "cursor-vision-settings",
      title:    "Cursor Vision – Spieler-Einstellungen",
      template: null,
      width:    480,
      height:   "auto",
      resizable: true,
    });
  }

  // Kein Handlebars-Template nötig – wir rendern HTML direkt
  async _renderInner(data) {
    const players = game.users.filter(u => !u.isGM && u.active);
    const config  = CursorVision.getConfig();

    const profileOptions = PROFILE_KEYS.map(k =>
      `<option value="${k}">${PROFILES[k].icon} ${PROFILES[k].label}</option>`
    ).join("");

    const playerRows = players.map(u => {
      const uConf      = config[u.id] ?? {};
      const profile    = uConf.profile ?? "none";
      const followId   = uConf.followId ?? "";
      const otherUsers = players.filter(p => p.id !== u.id);

      const followOptions = otherUsers.map(p =>
        `<option value="${p.id}" ${followId === p.id ? "selected" : ""}>${p.name}</option>`
      ).join("");

      const selectedProfile = (k) => k === profile ? "selected" : "";

      return `
        <tr data-user-id="${u.id}">
          <td style="padding:8px 4px;font-weight:500;">${u.name}</td>
          <td style="padding:8px 4px;">
            <select class="cv-profile-select" data-user-id="${u.id}" style="width:100%">
              ${PROFILE_KEYS.map(k => `<option value="${k}" ${selectedProfile(k)}>${PROFILES[k].icon} ${PROFILES[k].label}</option>`).join("")}
            </select>
          </td>
          <td style="padding:8px 4px;" class="cv-follow-cell" style="display:${profile === 'follow' ? 'table-cell' : 'none'}">
            <select class="cv-follow-select" data-user-id="${u.id}" style="width:100%">
              <option value="">– Spieler wählen –</option>
              ${followOptions}
            </select>
          </td>
        </tr>`;
    }).join("");

    const sceneEnabled = CursorVision.isSceneEnabled();

    const html = `
      <div style="padding:12px">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;padding-bottom:12px;border-bottom:1px solid #ccc">
          <label style="font-weight:bold">Cursor Vision in dieser Szene:</label>
          <input type="checkbox" id="cv-scene-toggle" ${sceneEnabled ? "checked" : ""} style="width:18px;height:18px">
        </div>
        ${players.length === 0
          ? '<p style="color:#888">Keine aktiven Spieler gefunden.</p>'
          : `<table style="width:100%;border-collapse:collapse">
              <thead>
                <tr>
                  <th style="text-align:left;padding:4px;border-bottom:1px solid #ccc">Spieler</th>
                  <th style="text-align:left;padding:4px;border-bottom:1px solid #ccc">Lichtquelle</th>
                  <th style="text-align:left;padding:4px;border-bottom:1px solid #ccc">Folgt</th>
                </tr>
              </thead>
              <tbody>${playerRows}</tbody>
            </table>`
        }
        <div style="margin-top:16px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="cv-save-btn" style="padding:6px 16px">💾 Speichern</button>
        </div>
      </div>`;

    const $html = $(html);

    // Profil-Änderung → Follow-Spalte ein/ausblenden
    $html.find(".cv-profile-select").on("change", function() {
      const row = $(this).closest("tr");
      const followCell = row.find(".cv-follow-cell");
      if ($(this).val() === "follow") {
        followCell.show();
      } else {
        followCell.hide();
      }
    });

    // Follow-Spalten initial korrekt ein/ausblenden
    $html.find(".cv-profile-select").each(function() {
      const row = $(this).closest("tr");
      const followCell = row.find(".cv-follow-cell");
      if ($(this).val() !== "follow") followCell.hide();
    });

    // Speichern
    $html.find("#cv-save-btn").on("click", async () => {
      const sceneEnabled = $html.find("#cv-scene-toggle").prop("checked");
      await CursorVision.setSceneEnabled(sceneEnabled);

      const newConfig = { ...CursorVision.getConfig() };
      $html.find(".cv-profile-select").each(function() {
        const userId  = $(this).data("user-id");
        const profile = $(this).val();
        const followId = $html.find(`.cv-follow-select[data-user-id="${userId}"]`).val() ?? "";
        newConfig[userId] = { profile, followId };
      });

      await CursorVision.setConfig(newConfig);
      ui.notifications.info("Cursor Vision: Einstellungen gespeichert!");
      this.close();
    }.bind(this));

    return $html;
  }

  getData() { return {}; }
}

// ── Hauptklasse ──────────────────────────────────────────────────────────────
class CursorVision {
  static _canvas  = null;
  static _ctx     = null;
  static _animId  = null;
  static _mouse   = { x: -999, y: -999, onStage: false };
  static _followMouse = { x: -999, y: -999 }; // Position des gefolgten Spielers
  static _mouseMoveHandler  = null;
  static _mouseLeaveHandler = null;
  static _flickerOffset = 0;

  // ── Konfiguration ──────────────────────────────────────────────────────────

  static getConfig() {
    return game.settings.get(MODULE_ID, "sceneConfig") ?? {};
  }

  static async setConfig(config) {
    await game.settings.set(MODULE_ID, "sceneConfig", config);
    // Alle Clients updaten
    game.socket.emit(SOCKET_ID, { type: "configUpdate" });
    this.refresh();
  }

  static isSceneEnabled() {
    return canvas?.scene?.getFlag(MODULE_ID, "enabled") ?? false;
  }

  static async setSceneEnabled(active) {
    await canvas.scene.setFlag(MODULE_ID, "enabled", active);
    game.socket.emit(SOCKET_ID, { type: "configUpdate" });
    this.refresh();
  }

  static getMyConfig() {
    const config = this.getConfig();
    return config[game.user.id] ?? { profile: "none", followId: "" };
  }

  static getMyProfile() {
    const myConf = this.getMyConfig();
    return PROFILES[myConf.profile] ?? PROFILES.none;
  }

  static openSettings() {
    new CursorVisionSettings().render(true);
  }

  // ── Socket ─────────────────────────────────────────────────────────────────

  static onSocket(data) {
    if (data.type === "configUpdate") {
      this.refresh();
    }
    // Mausposition eines anderen Spielers empfangen
    if (data.type === "mousePos" && !game.user.isGM) {
      const myConf = this.getMyConfig();
      if (myConf.profile === "follow" && myConf.followId === data.userId) {
        this._followMouse = { x: data.x, y: data.y };
      }
    }
  }

  // ── Aktiv-Check ────────────────────────────────────────────────────────────

  static get isActive() {
    if (!canvas?.ready) return false;
    if (game.user.isGM) return false;
    if (!this.isSceneEnabled()) return false;
    const profile = this.getMyConfig().profile;
    return profile !== undefined; // Auch "none" ist aktiv (komplette Dunkelheit)
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  static refresh() {
    if (this.isActive) this._activate();
    else               this._deactivate();
    if (game.user.isGM) ui.controls?.render();
  }

  static _activate() {
    if (this._canvas) return;

    const foundryCanvas = document.querySelector("#board canvas") ?? document.querySelector("canvas#board");
    const parent = foundryCanvas?.parentElement ?? document.getElementById("board") ?? document.body;

    this._canvas = document.createElement("canvas");
    this._canvas.id = "cursor-vision-overlay";
    this._canvas.style.cssText = `
      position: absolute; top: 0; left: 0;
      width: 100%; height: 100%;
      pointer-events: none; z-index: 9999;
    `;
    parent.appendChild(this._canvas);
    this._ctx = this._canvas.getContext("2d");

    this._mouseMoveHandler = (event) => {
      const pos = event.data?.getLocalPosition?.(canvas.stage);
      if (!pos) return;
      const t = canvas.stage.transform.worldTransform;
      this._mouse.x = pos.x * t.a + t.tx;
      this._mouse.y = pos.y * t.d + t.ty;
      this._mouse.onStage = true;

      // Eigene Position an andere senden (für "Folgt"-Modus)
      game.socket.emit(SOCKET_ID, {
        type:   "mousePos",
        userId: game.user.id,
        x:      this._mouse.x,
        y:      this._mouse.y,
      });
    };
    this._mouseLeaveHandler = () => { this._mouse.onStage = false; };

    canvas.stage.on("mousemove", this._mouseMoveHandler);
    canvas.app.view.addEventListener("mouseleave", this._mouseLeaveHandler);

    const loop = () => {
      this._draw();
      this._animId = requestAnimationFrame(loop);
    };
    this._animId = requestAnimationFrame(loop);
  }

  static _deactivate() {
    if (!this._canvas) return;
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    canvas.stage?.off("mousemove", this._mouseMoveHandler);
    canvas.app?.view?.removeEventListener("mouseleave", this._mouseLeaveHandler);
    this._mouseMoveHandler = null;
    this._mouseLeaveHandler = null;
    this._canvas.remove();
    this._canvas = null;
    this._ctx    = null;
  }

  // ── Zeichnen ───────────────────────────────────────────────────────────────

  static _draw() {
    if (!this._canvas || !this._ctx) return;

    const view = canvas.app.view;
    if (this._canvas.width  !== view.clientWidth)  this._canvas.width  = view.clientWidth;
    if (this._canvas.height !== view.clientHeight) this._canvas.height = view.clientHeight;

    const W = this._canvas.width, H = this._canvas.height;
    const ctx = this._ctx;
    const myConf    = this.getMyConfig();
    const profile   = PROFILES[myConf.profile] ?? PROFILES.none;

    // Mausposition bestimmen (eigene oder gefolgter Spieler)
    const isFollowing = myConf.profile === "follow";
    const mx = isFollowing ? this._followMouse.x : this._mouse.x;
    const my = isFollowing ? this._followMouse.y : this._mouse.y;
    const hasPos = mx > -900;

    // Flackern
    let radius = profile.radius;
    if (profile.flicker) {
      this._flickerOffset += 0.08;
      const f = Math.sin(this._flickerOffset * 1.7) * 6
              + Math.sin(this._flickerOffset * 3.1) * 4
              + Math.sin(this._flickerOffset * 0.5) * 8;
      radius = Math.max(40, radius + f);
    }

    ctx.clearRect(0, 0, W, H);

    // Schwarzweiß-Filter für Nachtsicht
    if (profile.grayscale) {
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 1.0;
      // Graustufen-Overlay via multiply-ähnlichem Effekt
      ctx.filter = "grayscale(1)";
    } else {
      ctx.filter = "none";
    }

    // Schwarze Basisschicht
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = profile.opacity;
    ctx.fillStyle = profile.grayscale ? "#888888" : "#000000";
    ctx.fillRect(0, 0, W, H);

    // Kein Loch wenn kein Profil oder keine Position
    if (profile.radius === 0 || !hasPos) return;

    ctx.globalCompositeOperation = "destination-out";
    ctx.globalAlpha = 1.0;
    ctx.filter = "none";

    if (!profile.softEdge) {
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(mx, my, 0, mx, my, radius);
      grad.addColorStop(0,    "rgba(0,0,0,1)");
      grad.addColorStop(0.55, "rgba(0,0,0,0.95)");
      grad.addColorStop(0.8,  "rgba(0,0,0,0.4)");
      grad.addColorStop(1,    "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = 1.0;
  }
}

// ── Hooks ────────────────────────────────────────────────────────────────────
Hooks.on("canvasReady", () => CursorVision.refresh());
Hooks.on("canvasTearDown", () => CursorVision._deactivate());
Hooks.on("updateScene", (scene, changes) => {
  if (scene.id !== canvas?.scene?.id) return;
  if (foundry.utils.hasProperty(changes, `flags.${MODULE_ID}`)) CursorVision.refresh();
});
Hooks.on("userConnected", () => CursorVision.refresh());
