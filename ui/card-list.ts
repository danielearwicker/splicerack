// Shared card list builder — used by layers, keyframes, and audio editors.
// Eliminates repeated DOM boilerplate for editable card lists with
// number badges, reorder buttons, delete buttons, and add buttons.

export interface CardListConfig {
  /** Optional section header text (e.g. "Audio", "Keyframes") */
  headerText?: string;
  /** The array of items to display as cards */
  items: any[];
  /** Text for the "add" button at the bottom */
  addButtonText: string;
  /** Whether cards can be reordered with up/down buttons (default: true) */
  canReorder?: boolean;
  /** Called after any mutation (reorder, delete) */
  onChanged: () => void;
  /** Append custom content to the card header (e.g. type dropdown, summary label) */
  renderItemHeader: (item: any, index: number, header: HTMLElement) => void;
  /** Append custom content to the card body (e.g. property fields) */
  renderItemBody: (item: any, index: number, card: HTMLElement) => void;
  /** Custom delete handler. Default: items.splice(index, 1) */
  onDelete?: (items: any[], index: number) => void;
  /** Called when add button is clicked */
  onAdd: () => void;
  /** Extra action buttons per card (e.g. "Unstack"), inserted before delete */
  extraItemActions?: (item: any, index: number) => HTMLElement[];
}

export function buildCardList(config: CardListConfig): HTMLElement {
  const container = document.createElement("div");
  container.style.padding = "0 12px 8px";

  if (config.headerText) {
    const header = document.createElement("div");
    header.className = "prop-group-header";
    header.textContent = config.headerText;
    container.appendChild(header);
  }

  const canReorder = config.canReorder !== false;

  for (let i = 0; i < config.items.length; i++) {
    const item = config.items[i];
    const card = document.createElement("div");
    card.className = "layer-card";

    // Header
    const cardHeader = document.createElement("div");
    cardHeader.className = "layer-card-header";

    const num = document.createElement("span");
    num.className = "layer-num";
    num.textContent = `${i + 1}`;
    cardHeader.appendChild(num);

    config.renderItemHeader(item, i, cardHeader);

    // Actions
    const actions = document.createElement("span");
    actions.className = "layer-actions";

    if (canReorder && i > 0) {
      const upBtn = document.createElement("button");
      upBtn.textContent = "\u2191";
      upBtn.addEventListener("click", () => {
        [config.items[i - 1], config.items[i]] = [config.items[i], config.items[i - 1]];
        config.onChanged();
      });
      actions.appendChild(upBtn);
    }

    if (canReorder && i < config.items.length - 1) {
      const downBtn = document.createElement("button");
      downBtn.textContent = "\u2193";
      downBtn.addEventListener("click", () => {
        [config.items[i], config.items[i + 1]] = [config.items[i + 1], config.items[i]];
        config.onChanged();
      });
      actions.appendChild(downBtn);
    }

    if (config.extraItemActions) {
      for (const btn of config.extraItemActions(item, i)) {
        actions.appendChild(btn);
      }
    }

    const delBtn = document.createElement("button");
    delBtn.className = "layer-delete";
    delBtn.textContent = "\u00D7";
    delBtn.addEventListener("click", () => {
      if (config.onDelete) {
        config.onDelete(config.items, i);
      } else {
        config.items.splice(i, 1);
      }
      config.onChanged();
    });
    actions.appendChild(delBtn);

    cardHeader.appendChild(actions);
    card.appendChild(cardHeader);

    config.renderItemBody(item, i, card);

    container.appendChild(card);
  }

  // Add button
  const addBtn = document.createElement("button");
  addBtn.className = "layers-add-btn";
  addBtn.textContent = config.addButtonText;
  addBtn.addEventListener("click", () => config.onAdd());
  container.appendChild(addBtn);

  return container;
}
