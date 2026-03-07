import { useInput } from "ink";
import { useRef } from "react";
import type { Screen } from "../state.js";

export interface KeybindingActions {
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  onSelect: () => void;
  onNextPane: () => void;
  onPrevPane: () => void;
  onSetLogMode: (mode: "structured" | "raw") => void;
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
  onPaneShortcut: (index: number) => void;
  onGoTop: () => void;
  onGoBottom: () => void;
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

    // Pane switching
    if (key.tab && !key.shift) actions.onNextPane();
    if (key.tab && key.shift) actions.onPrevPane();

    // Log modes
    if (input === "S") actions.onSetLogMode("structured");
    if (input === "L") actions.onSetLogMode("raw");

    // Run actions
    if (input === "a" || input === "A") actions.onApprove();
    if (input === "c" || input === "C") actions.onContinue();
    if (input === "r" || input === "R") actions.onRetry();
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

    // Filter (/ key)
    if (input === "/") actions.onFilter();

    // Command palette (: key) — only when not in inputMode (already guarded above)
    if (input === ":") actions.onCommandPalette();

    // Help (? key)
    if (input === "?") actions.onHelp();

    // Pane shortcuts (1-5) — only on run screen
    if (screen === "run") {
      if (input === "1") actions.onPaneShortcut(0);
      if (input === "2") actions.onPaneShortcut(1);
      if (input === "3") actions.onPaneShortcut(2);
      if (input === "4") actions.onPaneShortcut(3);
      if (input === "5") actions.onPaneShortcut(4);
    }

    // G → go to bottom
    if (input === "G") actions.onGoBottom();

    // gg → go to top (track last key with 300ms timeout)
    const now = Date.now();
    if (input === "g" && !key.shift) {
      if (lastKeyRef.current.key === "g" && now - lastKeyRef.current.time < 300) {
        actions.onGoTop();
        lastKeyRef.current = { key: "", time: 0 };
        return;
      }
      lastKeyRef.current = { key: "g", time: now };
    } else {
      lastKeyRef.current = { key: input, time: now };
    }
  });
}
