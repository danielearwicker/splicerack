import type { TypeDefinition, PropertySchema, Segment, ClipDef } from "../shared/types.ts";

interface SpliceRackGlobal {
  types: Record<string, TypeDefinition>;
  registerType: (name: string, definition: TypeDefinition) => void;
  formatTime: (seconds: number) => string;
  deepMerge: (base: Record<string, unknown>, override: Record<string, unknown>) => Record<string, unknown>;
}

declare global {
  var SpliceRack: SpliceRackGlobal;
  function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown>;
  function formatTime(seconds: number): string;
  function escapeHtml(str: string): string;
  function getNestedValue(obj: any, path: string): any;
  function setNestedValue(obj: any, path: string, value: any): void;
  function deleteNestedValue(obj: any, path: string): void;
  function isKnownType(type: string): boolean;
  function getLibraryFiles(accept?: string[]): Promise<Array<{name: string; size: number; modified: string}>>;
  function getVoicesList(): Promise<Array<{name: string; displayName: string; locale: string; gender: string; localeName: string}>>;
  function getAudioFiles(): Promise<Array<{name: string; size: number; modified: string}>>;
  function renderPropertyField(prop: PropertySchema & { _sourceClips?: ClipDef[] }, displayValue: any, onChange: (val: any) => void): HTMLElement;
  interface CardListConfig {
    headerText?: string;
    items: any[];
    addButtonText: string;
    canReorder?: boolean;
    onChanged: () => void;
    renderItemHeader: (item: any, index: number, header: HTMLElement) => void;
    renderItemBody: (item: any, index: number, card: HTMLElement) => void;
    onDelete?: (items: any[], index: number) => void;
    onAdd: () => void;
    extraItemActions?: (item: any, index: number) => HTMLElement[];
  }
  function buildCardList(config: CardListConfig): HTMLElement;
  function getMergedTemplates(): Record<string, Record<string, unknown>>;
  function syncYamlFromData(): void;
  function renderEditorPanel(index: number): Promise<void>;
  function renderSequence(): Promise<void>;
  function closeEditor(): void;
  function addLog(level: string, message: string): void;
}

export {};
