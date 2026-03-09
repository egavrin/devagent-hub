import type { Artifact } from "../../state/types.js";
interface ArtifactDiffViewProps {
    older: Artifact;
    newer: Artifact;
    height: number;
}
export declare function ArtifactDiffView({ older, newer, height }: ArtifactDiffViewProps): import("react/jsx-runtime").JSX.Element;
export {};
