import type { DetailTab } from "../state.js";
interface DetailTabBarProps {
    activeTab: DetailTab;
    onSelect: (tab: DetailTab) => void;
}
export declare function DetailTabBar({ activeTab }: DetailTabBarProps): import("react/jsx-runtime").JSX.Element;
export {};
