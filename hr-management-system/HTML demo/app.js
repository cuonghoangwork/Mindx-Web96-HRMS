const body = document.body;
const pageTitle = document.getElementById("page-title");
const menuItems = document.querySelectorAll(".menu-item");
const themeOptions = document.querySelectorAll(".theme-option");
const forgotBackBtn = document.getElementById("forgot-back-btn");

const THEME_KEY = "hrms-theme";
const TITLE_KEY = "hrms-active-page";

function setActiveMenu(button, shouldNavigate = false, updateTitle = true) {
  menuItems.forEach((item) => item.classList.toggle("active", item === button));

  const title = button.dataset.title || "Dashboard";
  if (pageTitle && updateTitle) {
    pageTitle.textContent = title;
  }

  localStorage.setItem(TITLE_KEY, title);

  if (shouldNavigate && button.dataset.link) {
    const currentPath =
      window.location.pathname.split("/").pop() || "index.html";
    if (button.dataset.link !== currentPath) {
      window.location.href = button.dataset.link;
    }
  }
}

function applyTheme(theme) {
  if (!body) return;
  // Use HRMSStore if available, otherwise fallback to direct localStorage
  if (window.HRMSStore) {
    window.HRMSStore.theme.actions.set(theme);
  } else {
    body.setAttribute("data-theme", theme);
    themeOptions.forEach((option) => {
      option.classList.toggle("active", option.dataset.themeOption === theme);
    });
    localStorage.setItem(THEME_KEY, theme);
  }
}

function filterEmployees(query, tableBody) {
  const normalized = query.trim().toLowerCase();
  const rows = Array.from(
    tableBody.querySelectorAll("tbody tr:not(.no-results)"),
  );
  let visibleCount = 0;

  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    const matches = !normalized || text.includes(normalized);
    row.style.display = matches ? "" : "none";
    if (matches) visibleCount += 1;
  });

  const existingNoResults = tableBody.querySelector(".no-results");
  if (visibleCount === 0) {
    if (!existingNoResults) {
      const emptyRow = document.createElement("tr");
      emptyRow.className = "no-results";
      emptyRow.innerHTML = `<td colspan="7" class="no-results-cell">No matching employees found.</td>`;
      tableBody.appendChild(emptyRow);
    }
  } else if (existingNoResults) {
    existingNoResults.remove();
  }
}

function createEmployeeRow({
  name,
  id,
  department,
  designation,
  type,
  status,
}) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><span class="emp-avatar"></span> ${name}</td>
    <td>${id}</td>
    <td>${department}</td>
    <td>${designation}</td>
    <td>${type}</td>
    <td><span class="tag ${status === "On time" ? "green" : status === "Late" ? "red" : "purple"}">${status}</span></td>
    <td class="action-cell">
      <button class="action-icon" type="button" data-action="view" aria-label="View">👁</button>
      <button class="action-icon" type="button" data-action="edit" aria-label="Edit">✎</button>
      <button class="action-icon" type="button" data-action="delete" aria-label="Delete">🗑</button>
    </td>
  `;
  return row;
}

function initEmployeePage() {
  const searchInput = document.querySelector(".employee-search");
  const addButton = document.querySelector(".employee-add");
  const filterButton = document.querySelector(".employee-filter");
  const tableBody = document.querySelector(".employee-table tbody");
  const modal = document.getElementById("employee-modal");
  const modalClose = document.getElementById("employee-modal-close");
  const modalCancel = document.getElementById("employee-modal-cancel");
  const filterModal = document.getElementById("filter-modal");
  const filterClose = document.getElementById("filter-modal-close");
  const filterApply = document.getElementById("filter-modal-apply");
  const filterClear = document.getElementById("filter-modal-clear");
  const employeeForm = document.getElementById("employee-form");

  if (
    !searchInput ||
    !addButton ||
    !tableBody ||
    !modal ||
    !modalClose ||
    !modalCancel ||
    !filterModal ||
    !filterClose ||
    !filterApply ||
    !filterClear ||
    !employeeForm
  ) {
    return;
  }

  searchInput.setAttribute("placeholder", "Search by name, ID or department");

  searchInput.addEventListener("input", () =>
    filterEmployees(searchInput.value, tableBody),
  );

  addButton.addEventListener("click", () => {
    if (addButton.dataset.link) {
      closeAllModals();
      window.location.href = addButton.dataset.link;
      return;
    }
    modal.classList.remove("hidden");
  });

  filterButton.addEventListener("click", () => {
    filterModal.classList.remove("hidden");
  });

  filterClose.addEventListener("click", () =>
    filterModal.classList.add("hidden"),
  );
  filterClear.addEventListener("click", () => {
    const filterInput = filterModal.querySelector("input");
    const optionButtons = filterModal.querySelectorAll(".filter-option");
    if (filterInput) {
      filterInput.value = "";
    }
    optionButtons.forEach((button) => button.classList.remove("active"));
  });

  filterApply.addEventListener("click", () => {
    filterModal.classList.add("hidden");
  });

  const filterOptionButtons = filterModal.querySelectorAll(".filter-option");
  filterOptionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      filterOptionButtons.forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
    });
  });

  filterModal.addEventListener("click", (event) => {
    if (event.target === filterModal) {
      filterModal.classList.add("hidden");
    }
  });

  const pageTabs = document.querySelectorAll(".page-tab");
  const pageViews = document.querySelectorAll(".page-view");

  pageTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const selectedPage = tab.dataset.page;
      pageTabs.forEach((item) => item.classList.toggle("active", item === tab));
      pageViews.forEach((view) => {
        view.classList.toggle("hidden", view.dataset.page !== selectedPage);
      });
    });
  });

  const pageActionButtons = document.querySelectorAll("[data-page-action]");
  pageActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const targetPage = button.dataset.pageAction;
      if (!targetPage) return;
      pageTabs.forEach((tab) => {
        tab.classList.toggle("active", tab.dataset.page === targetPage);
      });
      pageViews.forEach((view) => {
        view.classList.toggle("hidden", view.dataset.page !== targetPage);
      });
    });
  });

  const profileTabs = document.querySelectorAll(".profile-tab");
  const profileSections = document.querySelectorAll(".profile-section");

  profileTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      profileTabs.forEach((item) => item.classList.remove("active"));
      tab.classList.add("active");
      const selectedSection = tab.textContent.trim().toLowerCase();
      profileSections.forEach((section) => {
        section.classList.toggle(
          "hidden",
          section.dataset.section !== selectedSection,
        );
      });
    });
  });

  modalClose.addEventListener("click", () => modal.classList.add("hidden"));
  modalCancel.addEventListener("click", () => modal.classList.add("hidden"));
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      modal.classList.add("hidden");
    }
  });

  employeeForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(employeeForm);
    const employee = {
      name: formData.get("name").trim(),
      id: formData.get("employeeId").trim(),
      department: formData.get("department").trim(),
      designation: formData.get("designation").trim(),
      type: formData.get("type").trim(),
      status: formData.get("status").trim(),
    };

    if (!employee.name || !employee.id || !employee.department) {
      return;
    }

    tableBody.appendChild(createEmployeeRow(employee));
    filterEmployees(searchInput.value, tableBody);
    employeeForm.reset();
    modal.classList.add("hidden");
  });

  tableBody.addEventListener("click", (event) => {
    const button = event.target.closest(".action-icon");
    if (!button) {
      return;
    }

    const row = button.closest("tr");
    if (!row) {
      return;
    }

    const employeeName = row.querySelector("td:first-child").textContent.trim();

    if (button.dataset.action === "delete") {
      row.remove();
      filterEmployees(searchInput.value, tableBody);
      return;
    }

    if (button.dataset.action === "view") {
      closeAllModals();
      window.location.href = "view-employee.html";
      return;
    }

    if (button.dataset.action === "edit") {
      alert(`Edit employee ${employeeName}`);
      return;
    }
  });
}

function closeAllModals() {
  const modals = document.querySelectorAll(
    ".modal-overlay, #employee-modal, #filter-modal, #job-modal, #holiday-modal, .profile-overlay",
  );
  modals.forEach((modal) => {
    if (modal && !modal.classList.contains("hidden")) {
      modal.classList.add("hidden");
    }
  });
  // Update store state if available
  if (window.HRMSStore) {
    window.HRMSStore.modals.actions.closeAll();
  }
}

function initMenuNavigation() {
  menuItems.forEach((item) => {
    item.addEventListener("click", () => {
      closeAllModals();
      // Small delay to allow modal close animation before navigation
      setTimeout(() => setActiveMenu(item, true), 50);
    });
  });
}

function initThemeSwitcher() {
  themeOptions.forEach((option) => {
    option.addEventListener("click", () => {
      const theme = option.dataset.themeOption;
      if (theme) {
        applyTheme(theme);
      }
    });
  });
}

function initJobPage() {
  const addJobButton = document.getElementById("job-add-btn");
  const jobModal = document.getElementById("job-modal");
  const jobModalClose = document.getElementById("job-modal-close");
  const jobModalCancel = document.getElementById("job-modal-cancel");
  const jobForm = document.getElementById("job-form");

  if (
    !addJobButton ||
    !jobModal ||
    !jobModalClose ||
    !jobModalCancel ||
    !jobForm
  ) {
    return;
  }

  addJobButton.addEventListener("click", () => {
    jobModal.classList.remove("hidden");
  });

  jobModalClose.addEventListener("click", () => {
    jobModal.classList.add("hidden");
  });

  jobModalCancel.addEventListener("click", () => {
    jobModal.classList.add("hidden");
  });

  jobModal.addEventListener("click", (event) => {
    if (event.target === jobModal) {
      jobModal.classList.add("hidden");
    }
  });

  jobForm.addEventListener("submit", (event) => {
    event.preventDefault();
    jobForm.reset();
    jobModal.classList.add("hidden");
  });
}

function initHolidayPage() {
  const holidayAddButton = document.getElementById("holiday-add-btn");
  const holidayModal = document.getElementById("holiday-modal");
  const holidayModalClose = document.getElementById("holiday-modal-close");
  const holidayModalCancel = document.getElementById("holiday-modal-cancel");
  const holidayModalSave = document.getElementById("holiday-modal-save");

  if (
    !holidayAddButton ||
    !holidayModal ||
    !holidayModalClose ||
    !holidayModalCancel ||
    !holidayModalSave
  ) {
    return;
  }

  holidayAddButton.addEventListener("click", () => {
    holidayModal.classList.remove("hidden");
  });

  holidayModalClose.addEventListener("click", () => {
    holidayModal.classList.add("hidden");
  });

  holidayModalCancel.addEventListener("click", () => {
    holidayModal.classList.add("hidden");
  });

  holidayModal.addEventListener("click", (event) => {
    if (event.target === holidayModal) {
      holidayModal.classList.add("hidden");
    }
  });

  holidayModalSave.addEventListener("click", () => {
    holidayModal.classList.add("hidden");
  });
}

function restoreState() {
  const currentPage = window.location.pathname.split("/").pop() || "index.html";
  const aliasTitle = {
    "add-employee.html": "All Employees",
    "add-employee-professional.html": "All Employees",
    "add-employee-documents.html": "All Employees",
    "add-employee-account-access.html": "All Employees",
    "view-employee.html": "All Employees",
  }[currentPage];

  const matchingLinkItem = Array.from(menuItems).find(
    (item) =>
      item.dataset.link === currentPage || item.dataset.title === aliasTitle,
  );

  if (matchingLinkItem) {
    const updateTitle = typeof aliasTitle === "undefined";
    setActiveMenu(matchingLinkItem, false, updateTitle);
    return;
  }

  const savedTitle = localStorage.getItem(TITLE_KEY);
  if (!savedTitle) {
    return;
  }

  const matchedItem = Array.from(menuItems).find(
    (item) => item.dataset.title === savedTitle,
  );
  if (matchedItem) {
    setActiveMenu(matchedItem, false);
  }
}

function initForgotPasswordPage() {
  if (!forgotBackBtn) {
    return;
  }

  forgotBackBtn.addEventListener("click", () => {
    window.location.href = "index.html";
  });
}

function initAddEmployeePage() {
  const addForm = document.getElementById("add-employee-form");
  if (!addForm) {
    return;
  }

  addForm.addEventListener("submit", (event) => {
    event.preventDefault();
    alert("New employee added successfully.");
    window.location.href = "index.html";
  });
}

function restoreTheme() {
  // Use HRMSStore if available, otherwise fallback to direct localStorage
  if (window.HRMSStore) {
    const savedTheme = window.HRMSStore.theme.get();
    body.setAttribute("data-theme", savedTheme);
    themeOptions.forEach((option) => {
      option.classList.toggle(
        "active",
        option.dataset.themeOption === savedTheme,
      );
    });
  } else {
    const savedTheme = localStorage.getItem(THEME_KEY) || "light";
    applyTheme(savedTheme);
  }
}

restoreTheme();
restoreState();
initMenuNavigation();
initThemeSwitcher();
initEmployeePage();
initJobPage();
initHolidayPage();
initForgotPasswordPage();
initAddEmployeePage();

// Cleanup modals when navigating away to prevent stuck overlays
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    closeAllModals();
  }
});

// Also cleanup on page unload
window.addEventListener("beforeunload", closeAllModals);
