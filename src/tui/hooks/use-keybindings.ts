import { useInput } from "ink";
import { useRef } from "react";
import type { Screen } from "../state.js";

export interface KeybindingActions {
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  onSelect: () => void;
  onNextPane: () => void;
  onPrevPane: () => void;
  onNextDetailTab: () => void;
  onPrevDetailTab: () => void;
  onSetLogMode: (mode: "structured" | "raw" | "errors") => void;
  onApprove: () => void;
  onContinue: () => void;
  onRetry: () => void;
  onKill: () => void;
  onDelete: () => void;
  onNewRun: () => void;
  onQuit: () => void;
  onEnterInput: () => void;
  onExitInput: () => void;
  onBack: () => void;
  onRework: () => void;
  onOpenExternal: () => void;
  onApprovalsView: () => void;
  onToggleDiff: () => void;
  onPause: () => void;
  onTakeOver: () => void;
  onToggleAutopilot: () => void;
  onRunnersView: () => void;
  onAutopilotView: () => void;
  onFilter: () => void;
  onCommandPalette: () => void;
  onHelp: () => void;
  onDetailTabShortcut: (index: number) => void;
  onGoTop: () => void;
  onGoBottom: () => void;
  onEscalate: () => void;
  onSettingsView: () => void;
  onRerunWithProfile: () => void;
  onJumpArtifact: () => void;
  onJumpGate: () => void;
  onJumpError: () => void;
}

export function useKeybindings(
  actions: KeybindingActions,
  screen: Screen,
  inputMode: boolean,
): void {
  const lastKeyRef = useRef<{ key: string; time: number }>({ key: "", time: 0 });

  useInput((input, key) => {
    // In input/dialog mode, only Esc works
    if (inputMode) {
      if (key.escape) actions.onExitInput();
      return;
    }

    if (key.escape) {
      actions.onBack();
      return;
    }

    // Navigation
    if (key.upArrow || input === "k") actions.onNavigate("up");
    if (key.downArrow || input === "j") actions.onNavigate("down");
    if (key.leftArrow || input === "h") actions.onNavigate("left");
    if (key.rightArrow || input === "l") actions.onNavigate("right");

    if (key.return) actions.onSelect();

    // Pane / tab switching
    if (screen === "run") {
      if (key.tab && !key.shift) actions.onNextDetailTab();
      if (key.tab && key.shift) actions.onPrevDetailTab();
    } else {
      if (key.tab && !key.shift) actions.onNextPane();
      if (key.tab && key.shift) actions.onPrevPane();
    }

    // Log modes
    if (input === "S") actions.onSetLogMode("structured");
    if (input === "L") actions.onSetLogMode("raw");

    // Run actions
    if (input === "a" || input === "A") actions.onApprove();
    if (input === "c" || input === "C") actions.onContinue();
    if (input === "r") actions.onRetry();
    if (input === "R") actions.onRerunWithProfile();
    if (input === "w" || input === "W") actions.onRework();
    if (input === "K") actions.onKill();
    if (input === "d" || input === "D") actions.onDelete();
    if (input === "n" || input === "N") actions.onNewRun();
    if (input === "q" || input === "Q") actions.onQuit();
    if (input === "i" || input === "I") actions.onEnterInput();
    if (input === "o" || input === "O") actions.onOpenExternal();
    if (input === "v" || input === "V") actions.onApprovalsView();
    if (input === "f" || input === "F") actions.onToggleDiff();
    if (input === "p" || input === "P") actions.onPause();
    if (input === "t" || input === "T") actions.onTakeOver();
    if (input === "x" || input === "X") actions.onToggleAutopilot();
    if (input === "m" || input === "M") actions.onRunnersView();
    if (input === "u" || input === "U") actions.onAutopilotView();
    if (input === "e" || input === "E") actions.onEscalate();
    if (input === ",") actions.onSettingsView();

    // Filter (/ key)
    if (input === "/") actions.onFilter();

    // Command palette (: or . key)
    if (input === ":" || input === ".") actions.onCommandPalette();

    // Help (? key)
    if (input === "?") actions.onHelp();

    // Detail tab shortcuts (1-4) — only on run screen
    if (screen === "run") {
      if (input === "1") actions.onDetailTabShortcut(0);
      if (input === "2") actions.onDetailTabShortcut(1);
      if (input === "3") actions.onDetailTabShortcut(2);
      if (input === "4") actions.onDetailTabShortcut(3);
    }

    // G → go to bottom
    if (input === "G") actions.onGoBottom();

    // g-prefix commands (300ms timeout):
    // gg = go top, ga = jump artifact, ge = jump error
    // On run screen: gg = jump gate (instead of go-top which doesn't apply)
    const now = Date.now();
    if (lastKeyRef.current.key === "g" && now - lastKeyRef.current.time < 300) {
      if (input === "g") {
        if (screen === "run") {
          actions.onJumpGate();
        } else {
          actions.onGoTop();
        }
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      if (input === "a") {
        actions.onJumpArtifact();
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      if (input === "e") {
        actions.onJumpError();
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      // Not a valid g-sequence, fall through
      lastKeyRef.current = { key: input, time: now };
    } else if (input === "g" && !key.shift) {
      lastKeyRef.current = { key: "g", time: now };
    } else {
      lastKeyRef.current = { key: input, time: now };
    }
  });
}
