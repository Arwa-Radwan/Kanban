type TaskStatus = "todo" | "inprogress" | "done";
type PriorityLevel = "low" | "medium" | "high";

interface Task {
  id: string;
  title: string;
  description: string;
  priority: PriorityLevel;
  dueDate: string | null; 
  status: TaskStatus;
  createdAt: number;
}

interface ColumnConfig {
  status: TaskStatus;
  title: string;
  icon: string;
  iconClass: string;
}


class StorageService {
  readonly key: string;

  constructor(key: string) {
    this.key = key;
  }

  load(): Task[] {
    const raw = localStorage.getItem(this.key);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as Task[];
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch {
      return [];
    }
  }

  save(tasks: Task[]): void {
    localStorage.setItem(this.key, JSON.stringify(tasks));
  }
}


function uid(): string {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

function formatDueDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function isOverdue(iso: string | null, status: TaskStatus): boolean {
  if (!iso || status === "done") return false;
  const due = new Date(iso + "T23:59:59");
  return due.getTime() < Date.now();
}


class KanbanApp {
  tasks: Task[] = [];
  readonly storage: StorageService;
  readonly columns: ColumnConfig[] = [
    { status: "todo", title: "To Do", icon: "📋", iconClass: "icon--todo" },
    { status: "inprogress", title: "In Progress", icon: "◐", iconClass: "icon--inprogress" },
    { status: "done", title: "Completed", icon: "✓", iconClass: "icon--done" },
  ];

  editingId: string | null = null;
  draggedId: string | null = null;
  pendingDeleteId: string | null = null;
  activeFilter: PriorityLevel | "all" = "all";

  boardEl!: HTMLElement;
  modalEl!: HTMLElement;
  formEl!: HTMLFormElement;
  modalTitleEl!: HTMLElement;
  titleInput!: HTMLInputElement;
  descInput!: HTMLTextAreaElement;
  priorityInput!: HTMLSelectElement;
  dueDateInput!: HTMLInputElement;
  statusInput!: HTMLSelectElement;
  confirmEl!: HTMLElement;
  confirmTextEl!: HTMLElement;

  constructor(storageKey: string) {
    this.storage = new StorageService(storageKey);
    this.cacheDom();
    this.bindEvents();
    this.tasks = this.storage.load();
    this.render();
  }

  cacheDom(): void {
    this.boardEl = document.getElementById("board") as HTMLElement;
    this.modalEl = document.getElementById("task-modal") as HTMLElement;
    this.formEl = document.getElementById("task-form") as HTMLFormElement;
    this.modalTitleEl = document.getElementById("modal-title") as HTMLElement;
    this.titleInput = document.getElementById("task-title") as HTMLInputElement;
    this.descInput = document.getElementById("task-desc") as HTMLTextAreaElement;
    this.priorityInput = document.getElementById("task-priority") as HTMLSelectElement;
    this.dueDateInput = document.getElementById("task-due") as HTMLInputElement;
    this.statusInput = document.getElementById("task-status") as HTMLSelectElement;
    this.confirmEl = document.getElementById("confirm-modal") as HTMLElement;
    this.confirmTextEl = document.getElementById("confirm-text") as HTMLElement;
  }

  bindEvents(): void {
    document.getElementById("add-task-btn")!.addEventListener("click", () => this.openCreateModal());
    document.getElementById("modal-close")!.addEventListener("click", () => this.closeModal());
    document.getElementById("modal-cancel")!.addEventListener("click", () => this.closeModal());
    this.modalEl.addEventListener("click", (e) => {
      if (e.target === this.modalEl) this.closeModal();
    });
    this.formEl.addEventListener("submit", (e) => this.handleSubmit(e));

    document.getElementById("confirm-cancel")!.addEventListener("click", () => this.closeConfirm());
    document.getElementById("confirm-delete")!.addEventListener("click", () => this.confirmDelete());
    this.confirmEl.addEventListener("click", (e) => {
      if (e.target === this.confirmEl) this.closeConfirm();
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        this.closeModal();
        this.closeConfirm();
      }
    });

    const filterBar = document.getElementById("filter-bar")!;
    filterBar.addEventListener("click", (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-filter]");
      if (!btn) return;
      this.activeFilter = btn.dataset["filter"] as PriorityLevel | "all";
      filterBar.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      this.render();
    });
  }

  

  createTask(data: Omit<Task, "id" | "createdAt">): void {
    const task: Task = { ...data, id: uid(), createdAt: Date.now() };
    this.tasks.push(task);
    this.persistAndRender();
  }

  updateTask(id: string, data: Omit<Task, "id" | "createdAt">): void {
    const idx = this.tasks.findIndex((t) => t.id === id);
    if (idx === -1) return;
    this.tasks[idx] = { ...this.tasks[idx], ...data };
    this.persistAndRender();
  }

  deleteTask(id: string): void {
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.persistAndRender();
  }

  moveTask(id: string, status: TaskStatus): void {
    const task = this.tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    task.status = status;
    this.persistAndRender();
  }

  persistAndRender(): void {
    this.storage.save(this.tasks);
    this.render();
  }

  

  openCreateModal(presetStatus?: TaskStatus): void {
    this.editingId = null;
    this.modalTitleEl.textContent = "New Task";
    this.formEl.reset();
    this.priorityInput.value = "medium";
    this.statusInput.value = presetStatus ?? "todo";
    this.showModal();
  }

  openEditModal(task: Task): void {
    this.editingId = task.id;
    this.modalTitleEl.textContent = "Edit Task";
    this.titleInput.value = task.title;
    this.descInput.value = task.description;
    this.priorityInput.value = task.priority;
    this.dueDateInput.value = task.dueDate ?? "";
    this.statusInput.value = task.status;
    this.showModal();
  }

  showModal(): void {
    this.modalEl.classList.add("is-open");
    document.body.classList.add("no-scroll");
    setTimeout(() => this.titleInput.focus(), 50);
  }

  closeModal(): void {
    this.modalEl.classList.remove("is-open");
    document.body.classList.remove("no-scroll");
    this.editingId = null;
  }

  handleSubmit(e: Event): void {
    e.preventDefault();
    const title = this.titleInput.value.trim();
    if (!title) return;

    const data: Omit<Task, "id" | "createdAt"> = {
      title,
      description: this.descInput.value.trim(),
      priority: this.priorityInput.value as PriorityLevel,
      dueDate: this.dueDateInput.value || null,
      status: this.statusInput.value as TaskStatus,
    };

    if (this.editingId) {
      this.updateTask(this.editingId, data);
    } else {
      this.createTask(data);
    }
    this.closeModal();
  }



  askDelete(task: Task): void {
    this.pendingDeleteId = task.id;
    this.confirmTextEl.textContent = `Delete "${task.title}"? This can't be undone.`;
    this.confirmEl.classList.add("is-open");
  }

  closeConfirm(): void {
    this.confirmEl.classList.remove("is-open");
    this.pendingDeleteId = null;
  }

  confirmDelete(): void {
    if (this.pendingDeleteId) this.deleteTask(this.pendingDeleteId);
    this.closeConfirm();
  }


  render(): void {
    this.boardEl.innerHTML = "";

    const visibleTasks =
      this.activeFilter === "all" ? this.tasks : this.tasks.filter((t) => t.priority === this.activeFilter);

    for (const col of this.columns) {
      this.boardEl.appendChild(this.renderColumn(col, visibleTasks.filter((t) => t.status === col.status)));
    }

    this.updateCounts();
  }

  updateCounts(): void {
    for (const col of this.columns) {
      const badge = document.querySelector(`[data-count-for="${col.status}"]`);
      const n = this.tasks.filter((t) => t.status === col.status).length;
      if (badge) badge.textContent = `${n} ${n === 1 ? "task" : "tasks"}`;
    }
  }

  renderColumn(col: ColumnConfig, tasks: Task[]): HTMLElement {
    const section = document.createElement("section");
    section.className = `column column--${col.status}`;
    section.dataset["status"] = col.status;

    const header = document.createElement("div");
    header.className = "column__header";
    header.innerHTML = `
      <span class="column__icon ${col.iconClass}">${col.icon}</span>
      <div class="column__heading">
        <h2 class="column__title">${col.title}</h2>
        <span class="column__count" data-count-for="${col.status}">${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}</span>
      </div>
      <button type="button" class="column__add" aria-label="Add task to ${col.title}">+</button>
    `;
    header.querySelector(".column__add")!.addEventListener("click", () => this.openCreateModal(col.status));
    section.appendChild(header);

    const list = document.createElement("div");
    list.className = "column__list";
    list.addEventListener("dragover", (e) => this.handleDragOver(e));
    list.addEventListener("dragleave", () => list.classList.remove("is-drop-target"));
    list.addEventListener("drop", (e) => this.handleDrop(e, col.status));

    if (tasks.length === 0) {
      const empty = document.createElement("button");
      empty.type = "button";
      empty.className = "column__empty";
      empty.innerHTML = `
        <span class="column__empty-icon">📂</span>
        <span class="column__empty-title">No tasks yet</span>
        <span class="column__empty-sub">Click + to add one</span>
      `;
      empty.addEventListener("click", () => this.openCreateModal(col.status));
      list.appendChild(empty);
    } else {
      const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
      for (const task of sorted) {
        list.appendChild(this.renderCard(task));
      }
    }

    section.appendChild(list);
    return section;
  }

  renderCard(task: Task): HTMLElement {
    const card = document.createElement("article");
    card.className = `card card--${task.priority}`;
    card.draggable = true;
    card.dataset["id"] = task.id;

    card.addEventListener("dragstart", () => {
      this.draggedId = task.id;
      card.classList.add("is-dragging");
    });
    card.addEventListener("dragend", () => {
      card.classList.remove("is-dragging");
      this.draggedId = null;
    });

    const overdue = isOverdue(task.dueDate, task.status);
    const dueLabel = formatDueDate(task.dueDate);

    card.innerHTML = `
      <div class="card__top">
        <span class="card__priority">${task.priority}</span>
        <div class="card__actions">
          <button type="button" class="icon-btn" data-action="edit" aria-label="Edit task">✎</button>
          <button type="button" class="icon-btn icon-btn--danger" data-action="delete" aria-label="Delete task">🗑</button>
        </div>
      </div>
      <h3 class="card__title">${escapeHtml(task.title)}</h3>
      ${task.description ? `<p class="card__desc">${escapeHtml(task.description)}</p>` : ""}
      <div class="card__footer">
        ${dueLabel ? `<span class="card__due ${overdue ? "card__due--overdue" : ""}">📅 ${dueLabel}</span>` : "<span></span>"}
        <div class="card__move">
          ${this.renderMoveButtons(task)}
        </div>
      </div>
    `;

    card.querySelector('[data-action="edit"]')!.addEventListener("click", () => this.openEditModal(task));
    card.querySelector('[data-action="delete"]')!.addEventListener("click", () => this.askDelete(task));
    card.querySelectorAll<HTMLButtonElement>("[data-move-to]").forEach((btn) => {
      btn.addEventListener("click", () => this.moveTask(task.id, btn.dataset["moveTo"] as TaskStatus));
    });

    return card;
  }

  renderMoveButtons(task: Task): string {
    const order: TaskStatus[] = ["todo", "inprogress", "done"];
    const idx = order.indexOf(task.status);
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx < order.length - 1 ? order[idx + 1] : null;
    return `
      <button type="button" class="move-btn" data-move-to="${prev ?? ""}" ${prev ? "" : "disabled"} aria-label="Move left">←</button>
      <button type="button" class="move-btn" data-move-to="${next ?? ""}" ${next ? "" : "disabled"} aria-label="Move right">→</button>
    `;
  }

  handleDragOver(e: DragEvent): void {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.add("is-drop-target");
  }

  handleDrop(e: DragEvent, status: TaskStatus): void {
    e.preventDefault();
    (e.currentTarget as HTMLElement).classList.remove("is-drop-target");
    if (this.draggedId) this.moveTask(this.draggedId, status);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  new KanbanApp("kanban_tasks_v1");
});
