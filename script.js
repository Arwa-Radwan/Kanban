"use strict";

class StorageService {
    constructor(key) {
        this.key = key;
    }
    load() {
        const raw = localStorage.getItem(this.key);
        if (!raw)
            return [];
        try {
            const parsed = JSON.parse(raw);
            if (!Array.isArray(parsed))
                return [];
            return parsed;
        }
        catch (_a) {
            return [];
        }
    }
    save(tasks) {
        localStorage.setItem(this.key, JSON.stringify(tasks));
    }
}

function uid() {
    return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
function escapeHtml(input) {
    const div = document.createElement("div");
    div.textContent = input;
    return div.innerHTML;
}
function formatDueDate(iso) {
    if (!iso)
        return "";
    const d = new Date(iso + "T00:00:00");
    if (isNaN(d.getTime()))
        return "";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function isOverdue(iso, status) {
    if (!iso || status === "done")
        return false;
    const due = new Date(iso + "T23:59:59");
    return due.getTime() < Date.now();
}

class KanbanApp {
    constructor(storageKey) {
        this.tasks = [];
        this.columns = [
            { status: "todo", title: "To Do", icon: "📋", iconClass: "icon--todo" },
            { status: "inprogress", title: "In Progress", icon: "◐", iconClass: "icon--inprogress" },
            { status: "done", title: "Completed", icon: "✓", iconClass: "icon--done" },
        ];
        this.editingId = null;
        this.draggedId = null;
        this.pendingDeleteId = null;
        this.activeFilter = "all";
        this.storage = new StorageService(storageKey);
        this.cacheDom();
        this.bindEvents();
        this.tasks = this.storage.load();
        this.render();
    }
    cacheDom() {
        this.boardEl = document.getElementById("board");
        this.modalEl = document.getElementById("task-modal");
        this.formEl = document.getElementById("task-form");
        this.modalTitleEl = document.getElementById("modal-title");
        this.titleInput = document.getElementById("task-title");
        this.descInput = document.getElementById("task-desc");
        this.priorityInput = document.getElementById("task-priority");
        this.dueDateInput = document.getElementById("task-due");
        this.statusInput = document.getElementById("task-status");
        this.confirmEl = document.getElementById("confirm-modal");
        this.confirmTextEl = document.getElementById("confirm-text");
    }
    bindEvents() {
        document.getElementById("add-task-btn").addEventListener("click", () => this.openCreateModal());
        document.getElementById("modal-close").addEventListener("click", () => this.closeModal());
        document.getElementById("modal-cancel").addEventListener("click", () => this.closeModal());
        this.modalEl.addEventListener("click", (e) => {
            if (e.target === this.modalEl)
                this.closeModal();
        });
        this.formEl.addEventListener("submit", (e) => this.handleSubmit(e));
        document.getElementById("confirm-cancel").addEventListener("click", () => this.closeConfirm());
        document.getElementById("confirm-delete").addEventListener("click", () => this.confirmDelete());
        this.confirmEl.addEventListener("click", (e) => {
            if (e.target === this.confirmEl)
                this.closeConfirm();
        });
        document.addEventListener("keydown", (e) => {
            if (e.key === "Escape") {
                this.closeModal();
                this.closeConfirm();
            }
        });
        const filterBar = document.getElementById("filter-bar");
        filterBar.addEventListener("click", (e) => {
            const btn = e.target.closest("[data-filter]");
            if (!btn)
                return;
            this.activeFilter = btn.dataset["filter"];
            filterBar.querySelectorAll("[data-filter]").forEach((b) => b.classList.remove("is-active"));
            btn.classList.add("is-active");
            this.render();
        });
    }
   
    createTask(data) {
        const task = Object.assign(Object.assign({}, data), { id: uid(), createdAt: Date.now() });
        this.tasks.push(task);
        this.persistAndRender();
    }
    updateTask(id, data) {
        const idx = this.tasks.findIndex((t) => t.id === id);
        if (idx === -1)
            return;
        this.tasks[idx] = Object.assign(Object.assign({}, this.tasks[idx]), data);
        this.persistAndRender();
    }
    deleteTask(id) {
        this.tasks = this.tasks.filter((t) => t.id !== id);
        this.persistAndRender();
    }
    moveTask(id, status) {
        const task = this.tasks.find((t) => t.id === id);
        if (!task || task.status === status)
            return;
        task.status = status;
        this.persistAndRender();
    }
    persistAndRender() {
        this.storage.save(this.tasks);
        this.render();
    }
    
    openCreateModal(presetStatus) {
        this.editingId = null;
        this.modalTitleEl.textContent = "New Task";
        this.formEl.reset();
        this.priorityInput.value = "medium";
        this.statusInput.value = presetStatus !== null && presetStatus !== void 0 ? presetStatus : "todo";
        this.showModal();
    }
    openEditModal(task) {
        var _a;
        this.editingId = task.id;
        this.modalTitleEl.textContent = "Edit Task";
        this.titleInput.value = task.title;
        this.descInput.value = task.description;
        this.priorityInput.value = task.priority;
        this.dueDateInput.value = (_a = task.dueDate) !== null && _a !== void 0 ? _a : "";
        this.statusInput.value = task.status;
        this.showModal();
    }
    showModal() {
        this.modalEl.classList.add("is-open");
        document.body.classList.add("no-scroll");
        setTimeout(() => this.titleInput.focus(), 50);
    }
    closeModal() {
        this.modalEl.classList.remove("is-open");
        document.body.classList.remove("no-scroll");
        this.editingId = null;
    }
    handleSubmit(e) {
        e.preventDefault();
        const title = this.titleInput.value.trim();
        if (!title)
            return;
        const data = {
            title,
            description: this.descInput.value.trim(),
            priority: this.priorityInput.value,
            dueDate: this.dueDateInput.value || null,
            status: this.statusInput.value,
        };
        if (this.editingId) {
            this.updateTask(this.editingId, data);
        }
        else {
            this.createTask(data);
        }
        this.closeModal();
    }
   
    askDelete(task) {
        this.pendingDeleteId = task.id;
        this.confirmTextEl.textContent = `Delete "${task.title}"? This can't be undone.`;
        this.confirmEl.classList.add("is-open");
    }
    closeConfirm() {
        this.confirmEl.classList.remove("is-open");
        this.pendingDeleteId = null;
    }
    confirmDelete() {
        if (this.pendingDeleteId)
            this.deleteTask(this.pendingDeleteId);
        this.closeConfirm();
    }
    
    render() {
        this.boardEl.innerHTML = "";
        const visibleTasks = this.activeFilter === "all" ? this.tasks : this.tasks.filter((t) => t.priority === this.activeFilter);
        for (const col of this.columns) {
            this.boardEl.appendChild(this.renderColumn(col, visibleTasks.filter((t) => t.status === col.status)));
        }
        this.updateCounts();
    }
    updateCounts() {
        for (const col of this.columns) {
            const badge = document.querySelector(`[data-count-for="${col.status}"]`);
            const n = this.tasks.filter((t) => t.status === col.status).length;
            if (badge)
                badge.textContent = `${n} ${n === 1 ? "task" : "tasks"}`;
        }
    }
    renderColumn(col, tasks) {
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
        header.querySelector(".column__add").addEventListener("click", () => this.openCreateModal(col.status));
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
        }
        else {
            const sorted = [...tasks].sort((a, b) => b.createdAt - a.createdAt);
            for (const task of sorted) {
                list.appendChild(this.renderCard(task));
            }
        }
        section.appendChild(list);
        return section;
    }
    renderCard(task) {
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
        card.querySelector('[data-action="edit"]').addEventListener("click", () => this.openEditModal(task));
        card.querySelector('[data-action="delete"]').addEventListener("click", () => this.askDelete(task));
        card.querySelectorAll("[data-move-to]").forEach((btn) => {
            btn.addEventListener("click", () => this.moveTask(task.id, btn.dataset["moveTo"]));
        });
        return card;
    }
    renderMoveButtons(task) {
        const order = ["todo", "inprogress", "done"];
        const idx = order.indexOf(task.status);
        const prev = idx > 0 ? order[idx - 1] : null;
        const next = idx < order.length - 1 ? order[idx + 1] : null;
        return `
      <button type="button" class="move-btn" data-move-to="${prev !== null && prev !== void 0 ? prev : ""}" ${prev ? "" : "disabled"} aria-label="Move left">←</button>
      <button type="button" class="move-btn" data-move-to="${next !== null && next !== void 0 ? next : ""}" ${next ? "" : "disabled"} aria-label="Move right">→</button>
    `;
    }
    handleDragOver(e) {
        e.preventDefault();
        e.currentTarget.classList.add("is-drop-target");
    }
    handleDrop(e, status) {
        e.preventDefault();
        e.currentTarget.classList.remove("is-drop-target");
        if (this.draggedId)
            this.moveTask(this.draggedId, status);
    }
}

document.addEventListener("DOMContentLoaded", () => {
    new KanbanApp("kanban_tasks_v1");
});
