import { useInput } from "ink";

export type FocusPane = "kanban" | "logs" | "detail";
export type LogMode = "structured" | "raw";

export interface KeybindingActions {
  onNavigate: (direction: "up" | "down" | "left" | "right") => void;
  onSelect: () => void;
  onSwitchPane: () => void;
  onSetLogMode: (mode: LogMode) => void;
  onApprove: () => void;
  onRetry: () => void;
  onKill: () => void;
  onDelete: () => void;
  onNewRun: () => void;
  onQuit: () => void;
  onEnterInput: () => void;
  onExitInput: () => void;
  onBack: () => void;
}

export function useKeybindings(
  actions: KeybindingActions,
  focusPane: FocusPane,
  inputMode: boolean,
): void {
  useInput((input, key) => {
    if (inputMode) {
      if (key.escape) actions.onExitInput();
      return;
    }

    if (key.escape) {
      actions.onBack();
      return;
    }

    if (key.upArrow || input === "k") actions.onNavigate("up");
    if (key.downArrow || input === "j") actions.onNavigate("down");
    if (key.leftArrow || input === "h") actions.onNavigate("left");
    if (key.rightArrow || input === "l") actions.onNavigate("right");

    if (key.return) actions.onSelect();
    if (key.tab) actions.onSwitchPane();

    if (input === "s" || input === "S") actions.onSetLogMode("structured");
    if (input === "L") actions.onSetLogMode("raw");
    if (input === "a" || input === "A") actions.onApprove();
    if (input === "r" || input === "R") actions.onRetry();
    if (input === "K") actions.onKill();
    if (input === "D") actions.onDelete();
    if (input === "n" || input === "N") actions.onNewRun();
    if (input === "q" || input === "Q") actions.onQuit();
    if (input === "i" || input === "I") actions.onEnterInput();
  });
}
