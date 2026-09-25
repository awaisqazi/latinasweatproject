// src/lib/galaLive/operator.js
//
// Everything the operator can change at runtime, applied to a running page.
// The source is the state object that comes back with every poll
// (10 sections 1 and 3); there is no second table and no second subscription.
//
// Also the keyboard fallback for the display laptop, for when the network dies
// mid show. A local override flies a LOCAL flag and is dropped as soon as a
// newer remote version arrives (05 section 4.6).

import { CLIENT_VERSION, SCENES } from "./config.js";

/** "2026.09.20" style comparison. Missing or unparseable means "fine". */
export function versionBelow(current, minimum) {
  if (!minimum) return false;
  const a = String(current).split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  const b = String(minimum).split(/[.\-+]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0;
    const y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

/**
 * @param {{director:object, actions:object}} opts
 * `actions` is how the page reacts: setScene, setHold, setFx, setLift, setBoost,
 * toggleHud, toggleCalibration, toggleSafeArea, toggleQrSpotlight, fullscreen,
 * cycleFx, reloadPage, setLocalFlag, setStale.
 */
export function createOperator({ director, actions = {} }) {
  const act = {
    setScene: () => {},
    setHold: () => {},
    setLift: () => {},
    setBoost: () => {},
    toggleHud: () => {},
    toggleCalibration: () => {},
    toggleSafeArea: () => {},
    toggleQrSpotlight: () => {},
    fullscreen: () => {},
    cycleFx: () => {},
    programNext: () => {},
    programPrev: () => {},
    programHome: () => {},
    reloadPage: () => {},
    setLocalFlag: () => {},
    setStale: () => {},
    ...actions,
  };

  let localScene = "";
  let localSince = -1; // the state.version at which the override was taken
  let hold = false;
  let lift = 0;

  /**
   * @param {object} state merged runtime state
   * @param {{cueSeq:number, nonce:string, setCueSeq:Function, setNonce:Function}} cursorIo
   */
  function applyState(state, cursorIo) {
    // A newer remote row always wins over a keyboard override.
    if (localScene && Number(state.version) > localSince) {
      localScene = "";
      act.setLocalFlag(false);
    }

    director.setGoal(state.goal_cents);
    director.setTierEdges(state.tier_cents);
    director.setHold(!!state.hold);
    hold = !!state.hold;

    const scene = localScene || state.scene;
    director.setSceneName(scene);
    act.setScene(scene);

    act.setStale(versionBelow(CLIENT_VERSION, state.min_client_version));

    // One-shot cues. Row based, so a missed poll cannot lose one, and the
    // persisted cue_seq stops a reload from re-firing one.
    const seq = Number(state.cue_seq) || 0;
    if (seq > (cursorIo?.cueSeq || 0) && state.cue) {
      cursorIo?.setCueSeq(seq);
      const type = state.cue.type;
      if (type === "reload_page") act.reloadPage();
      else director.cue(state.cue);
    } else if (seq > (cursorIo?.cueSeq || 0)) {
      cursorIo?.setCueSeq(seq);
    }

    // reload_nonce: the operator's "every display, restart yourself". The new
    // nonce is written BEFORE the reload so it can never loop.
    const rn = String(state.reload_nonce || "");
    if (rn && cursorIo && rn !== cursorIo.nonce) {
      cursorIo.setNonce(rn);
      act.reloadPage();
    }
  }

  function onKeyDown(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const target = e.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

    // Sound-check keys live on Shift so they cannot be hit during the show.
    if (e.shiftKey) {
      if (e.key === "B") { act.setBoost("toggle"); e.preventDefault(); }
      else if (e.key === "C") { act.toggleCalibration(); e.preventDefault(); }
      else if (e.key === "G") { act.toggleSafeArea(); e.preventDefault(); }
      else if (e.key === "Q") { act.toggleQrSpotlight(); e.preventDefault(); }
      return;
    }

    const sceneKey = "1234567".indexOf(e.key);
    if (sceneKey >= 0 && sceneKey < SCENES.length) {
      localScene = SCENES[sceneKey];
      localSince = Number.MAX_SAFE_INTEGER; // cleared by the next newer version
      director.setSceneName(localScene);
      act.setScene(localScene);
      act.setLocalFlag(true);
      e.preventDefault();
      return;
    }

    // The run of show (program segments). Right, Space, Page Down (what a
    // presentation clicker sends) = next; Left, Page Up = back; Home = the
    // seating loop.
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") {
      act.programNext();
      e.preventDefault();
      return;
    }
    if (e.key === "ArrowLeft" || e.key === "PageUp") {
      act.programPrev();
      e.preventDefault();
      return;
    }
    if (e.key === "Home") {
      act.programHome();
      e.preventDefault();
      return;
    }

    switch (e.key) {
      // Hold moved from Space to H on 2026-09-25: Space now advances the program.
      case "h":
        hold = !hold;
        director.setHold(hold);
        act.setHold(hold);
        act.setLocalFlag(true);
        e.preventDefault();
        break;
      case "c":
        director.cue({ type: "confetti" });
        break;
      case "s":
        director.cue({ type: "supernova" });
        break;
      case "f":
        act.fullscreen();
        break;
      case "d":
        act.toggleHud();
        break;
      case "l":
        act.cycleFx();
        break;
      case "[":
        lift = Math.max(0, +(lift - 0.004).toFixed(3));
        act.setLift(lift);
        break;
      case "]":
        lift = Math.min(0.03, +(lift + 0.004).toFixed(3));
        act.setLift(lift);
        break;
      default:
        break;
    }
  }

  /** The version watermark for local overrides: called on every state read. */
  function noteVersion(v) {
    if (localScene && localSince === Number.MAX_SAFE_INTEGER) localSince = Number(v) || 0;
  }

  return {
    applyState(state, cursorIo) {
      noteVersion(state.version);
      applyState(state, cursorIo);
    },
    attach() {
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    },
    get localScene() {
      return localScene;
    },
  };
}
