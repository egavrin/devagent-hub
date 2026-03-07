import { useInput } from "ink";
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
}

export function useKeybindings(
  actions: KeybindingActions,
  screen: Screen,
  inputMode: boolean,
): void {
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
  });
}
