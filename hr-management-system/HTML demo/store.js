/**
 * HR Management System - State Store (Context-like pattern)
 * Vanilla JS implementation similar to React Context API
 */

class Store {
  constructor(initialState = {}) {
    this.state = { ...initialState };
    this.listeners = new Map();
    this.nextListenerId = 0;
  }

  /**
   * Get current state (or a slice of it)
   * @param {string} key - Optional key to get specific state slice
   */
  get(key = null) {
    if (key === null) return { ...this.state };
    return this.state[key];
  }

  /**
   * Update state (partial update, merges with existing state)
   * @param {object} newState - New state to merge
   */
  set(newState) {
    const prevState = { ...this.state };
    this.state = { ...this.state, ...newState };
    
    // Notify all listeners
    this.listeners.forEach((callback, key) => {
      if (key === null || newState.hasOwnProperty(key)) {
        callback(this.state, prevState);
      }
    });
  }

  /**
   * Subscribe to state changes
   * @param {function} callback - Function to call on state change
   * @param {string} key - Optional key to only listen to specific slice
   * @returns {number} Unsubscribe function id
   */
  subscribe(callback, key = null) {
    const id = this.nextListenerId++;
    this.listeners.set(id, callback);
    
    // Store the key this listener cares about
    callback._key = key;
    
    return () => {
      this.listeners.delete(id);
    };
  }

  /**
   * Create a state slice with its own actions
   * Similar to React Context Provider pattern
   */
  createSlice(name, initialValue, actions = {}) {
    this.state[name] = initialValue;
    
    const boundActions = {};
    for (const [actionName, actionFn] of Object.entries(actions)) {
      boundActions[actionName] = (...args) => {
        const currentValue = this.state[name];
        const newValue = actionFn(currentValue, ...args);
        this.set({ [name]: newValue });
        return newValue;
      };
    }
    
    return {
      get: () => this.get(name),
      set: (value) => this.set({ [name]: value }),
      subscribe: (callback) => this.subscribe(callback, name),
      actions: boundActions,
    };
  }
}

// ============================================
// Create Global Store Instance
// ============================================

const store = new Store({
  // Theme state
  theme: localStorage.getItem("hrms-theme") || "light",
  
  // Navigation state
  activePage: localStorage.getItem("hrms-active-page") || "Dashboard",
  
  // Employee data
  employees: [],
  selectedEmployee: null,
  
  // UI state
  modals: {
    employee: false,
    filter: false,
    job: false,
    holiday: false,
  },
  
  // Filters
  filters: {
    department: "",
    search: "",
  },
});

// ============================================
// Create Slices with Actions
// ============================================

// Theme Slice
const themeSlice = store.createSlice("theme", store.get("theme"), {
  toggle: (current) => (current === "light" ? "dark" : "light"),
  set: (_, newTheme) => newTheme,
});

// Navigation Slice
const navigationSlice = store.createSlice("activePage", store.get("activePage"), {
  navigate: (_, page) => page,
});

// Modal Slice
const modalSlice = store.createSlice("modals", store.get("modals"), {
  open: (current, modalName) => ({ ...current, [modalName]: true }),
  close: (current, modalName) => ({ ...current, [modalName]: false }),
  closeAll: () => ({
    employee: false,
    filter: false,
    job: false,
    holiday: false,
  }),
});

// Employee Slice
const employeeSlice = store.createSlice("employees", store.get("employees"), {
  set: (_, employees) => employees,
  add: (current, employee) => [...current, { ...employee, id: Date.now() }],
  remove: (current, id) => current.filter(emp => emp.id !== id),
  update: (current, id, updates) =>
    current.map(emp => (emp.id === id ? { ...emp, ...updates } : emp)),
  select: (_, employee) => employee,
});

// Filter Slice
const filterSlice = store.createSlice("filters", store.get("filters"), {
  setSearch: (current, search) => ({ ...current, search }),
  setDepartment: (current, department) => ({ ...current, department }),
  clear: () => ({ department: "", search: "" }),
});

// ============================================
// Theme Integration
// ============================================

// Apply theme to document when it changes
themeSlice.subscribe((state) => {
  document.body.setAttribute("data-theme", state.theme);
  localStorage.setItem("hrms-theme", state.theme);
});

// Initialize theme on load
document.body.setAttribute("data-theme", themeSlice.get());

// ============================================
// Modal Cleanup on Navigation
// ============================================

// Close all modals when page visibility changes
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    modalSlice.actions.closeAll();
  }
});

// Close all modals on page unload
window.addEventListener("beforeunload", () => {
  modalSlice.actions.closeAll();
});

// ============================================
// Export API
// ============================================

window.HRMSStore = {
  // Core store
  get: store.get.bind(store),
  set: store.set.bind(store),
  subscribe: store.subscribe.bind(store),
  
  // Slices
  theme: themeSlice,
  navigation: navigationSlice,
  modals: modalSlice,
  employees: employeeSlice,
  filters: filterSlice,
  
  // Helpers
  closeAllModals: () => modalSlice.actions.closeAll(),
  applyTheme: (theme) => themeSlice.actions.set(theme),
};

// Default export for modules
if (typeof module !== "undefined" && module.exports) {
  module.exports = { Store, store, HRMSStore: window.HRMSStore };
}
