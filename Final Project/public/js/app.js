const state = {
  dashboard: {
    jobs: [],
    skills: [],
    certifications: [],
    awards: [],
    resumeVersions: []
  },
  activeResumeVersionId: null,
  activeResumeData: null,
  previewMode: "digital"
};

const sectionTabs = document.querySelectorAll("#sectionTabs .nav-link");
const appSections = document.querySelectorAll(".app-section");
const statsGrid = document.getElementById("statsGrid");
const toastElement = document.getElementById("appToast");
const toastMessage = document.getElementById("toastMessage");
const resumeVersionSelect = document.getElementById("resumeVersionSelect");
const selectionEmptyState = document.getElementById("selectionEmptyState");
const selectionBuilder = document.getElementById("selectionBuilder");
const saveSelectionsButton = document.getElementById("saveSelectionsButton");
const resumePreview = document.getElementById("resumePreview");
const aiResponse = document.getElementById("aiResponse");
const bootstrapToast = new bootstrap.Toast(toastElement);

sectionTabs.forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    const sectionName = tabButton.dataset.section;

    sectionTabs.forEach((button) => button.classList.remove("active"));
    appSections.forEach((section) => section.classList.remove("active"));

    tabButton.classList.add("active");
    document.getElementById(`section-${sectionName}`).classList.add("active");
  });
});

function showToast(message, isError = false) {
  toastMessage.textContent = message;
  toastElement.classList.toggle("text-bg-danger", isError);
  toastElement.classList.toggle("text-bg-dark", !isError);
  bootstrapToast.show();
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json"
    },
    ...options
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }

  return data;
}

function renderStats() {
  const stats = [
    { label: "Jobs", value: state.dashboard.jobs.length },
    { label: "Skills", value: state.dashboard.skills.length },
    { label: "Certifications", value: state.dashboard.certifications.length },
    { label: "Awards", value: state.dashboard.awards.length },
    { label: "Resume Versions", value: state.dashboard.resumeVersions.length }
  ];

  statsGrid.innerHTML = stats
    .map(
      (item) => `
        <div class="col-sm-6 col-xl-4">
          <div class="stat-card h-100">
            <span class="section-label">${item.label}</span>
            <span class="stat-value">${item.value}</span>
          </div>
        </div>
      `
    )
    .join("");
}

function renderResumeVersionOptions() {
  const options = ['<option value="">Choose a version</option>']
    .concat(
      state.dashboard.resumeVersions.map(
        (version) => `<option value="${version.id}">${version.name}</option>`
      )
    )
    .join("");

  resumeVersionSelect.innerHTML = options;

  if (state.activeResumeVersionId) {
    resumeVersionSelect.value = String(state.activeResumeVersionId);
  }
}

function renderSelectionBuilder() {
  if (!state.activeResumeData) {
    selectionEmptyState.classList.remove("d-none");
    selectionBuilder.classList.add("d-none");
    selectionBuilder.innerHTML = "";
    saveSelectionsButton.disabled = true;
    return;
  }

  const { snapshot, selectedJobIds, selectedResponsibilityIds } = state.activeResumeData;

  selectionEmptyState.classList.add("d-none");
  selectionBuilder.classList.remove("d-none");
  saveSelectionsButton.disabled = false;

  selectionBuilder.innerHTML = snapshot.jobs
    .map((job) => {
      const jobChecked = selectedJobIds.includes(job.id) ? "checked" : "";
      const responsibilitiesMarkup = job.responsibilities.length
        ? job.responsibilities
            .map((responsibility) => {
              const responsibilityChecked = selectedResponsibilityIds.includes(responsibility.id) ? "checked" : "";
              return `
                <label class="form-check selection-responsibility">
                  <input
                    class="form-check-input responsibility-checkbox"
                    type="checkbox"
                    value="${responsibility.id}"
                    data-job-id="${job.id}"
                    ${responsibilityChecked}
                  />
                  <span class="form-check-label">${responsibility.description}</span>
                </label>
              `;
            })
            .join("")
        : '<p class="text-secondary mb-0">No responsibilities saved for this job yet.</p>';

      return `
        <article class="selection-job mb-3">
          <label class="form-check">
            <input class="form-check-input job-checkbox" type="checkbox" value="${job.id}" ${jobChecked} />
            <span class="form-check-label">
              <strong>${job.title}</strong> at ${job.company}
              <span class="d-block text-secondary small">${job.location || "Location not set"}</span>
            </span>
          </label>
          <div class="selection-responsibilities">${responsibilitiesMarkup}</div>
        </article>
      `;
    })
    .join("");
}

function buildSelectedPreviewData() {
  if (!state.activeResumeData) {
    return null;
  }

  const { resumeVersion, selectedJobIds, selectedResponsibilityIds, snapshot } = state.activeResumeData;
  const selectedJobs = snapshot.jobs
    .filter((job) => selectedJobIds.includes(job.id))
    .map((job) => ({
      ...job,
      responsibilities: job.responsibilities.filter((item) => selectedResponsibilityIds.includes(item.id))
    }));

  return {
    resumeVersion,
    jobs: selectedJobs,
    skillsByCategory: snapshot.skillsByCategory,
    certifications: snapshot.certifications,
    awards: snapshot.awards
  };
}

function renderPreview() {
  const previewData = buildSelectedPreviewData();

  resumePreview.classList.toggle("digital-view", state.previewMode === "digital");
  resumePreview.classList.toggle("print-view", state.previewMode === "print");

  if (!previewData) {
    resumePreview.innerHTML = '<div class="preview-empty">Select a resume version to render a preview.</div>';
    return;
  }

  const { resumeVersion, jobs, skillsByCategory, certifications, awards } = previewData;
  const skillMarkup = Object.entries(skillsByCategory)
    .map(
      ([category, skills]) => `
        <div class="resume-list-item">
          <strong>${category}</strong>
          <div class="mt-2">
            ${skills.map((skill) => `<span class="skill-chip">${skill.name}${skill.level ? ` - ${skill.level}` : ""}</span>`).join("")}
          </div>
        </div>
      `
    )
    .join("");

  const jobsMarkup = jobs.length
    ? jobs
        .map(
          (job) => `
            <article class="resume-job-item">
              <div class="resume-job-head">
                <div>
                  <strong>${job.title}</strong>
                  <div>${job.company}</div>
                </div>
                <span>${[job.startDate, job.endDate].filter(Boolean).join(" - ") || "Dates not set"}</span>
              </div>
              ${job.summary ? `<p class="mt-2 mb-2">${job.summary}</p>` : ""}
              <ul>
                ${
                  job.responsibilities.length
                    ? job.responsibilities.map((item) => `<li>${item.description}</li>`).join("")
                    : "<li>Add responsibilities to strengthen this section.</li>"
                }
              </ul>
            </article>
          `
        )
        .join("")
    : "<p class='text-secondary'>No jobs selected yet.</p>";

  const certificationMarkup = certifications.length
    ? certifications
        .map(
          (item) => `
            <div class="resume-list-item">
              <strong>${item.name}</strong>
              <div>${[item.issuer, item.issueDate].filter(Boolean).join(" | ")}</div>
              ${item.details ? `<p class="mb-0 mt-1">${item.details}</p>` : ""}
            </div>
          `
        )
        .join("")
    : "<p class='text-secondary'>No certifications added yet.</p>";

  const awardsMarkup = awards.length
    ? awards
        .map(
          (item) => `
            <div class="resume-list-item">
              <strong>${item.title}</strong>
              <div>${[item.issuer, item.awardDate].filter(Boolean).join(" | ")}</div>
              ${item.details ? `<p class="mb-0 mt-1">${item.details}</p>` : ""}
            </div>
          `
        )
        .join("")
    : "<p class='text-secondary'>No awards added yet.</p>";

  resumePreview.innerHTML = `
    <div class="resume-sheet">
      <header class="resume-header">
        <p class="section-label mb-0">Resume Preview</p>
        <h2 class="resume-name">${resumeVersion.name}</h2>
        <div class="resume-meta">${resumeVersion.target_role || "Target role not set"}</div>
        <p class="mb-0">${resumeVersion.professional_summary || "Add a professional summary for this version."}</p>
      </header>
      <section class="resume-section-block">
        <h3>Experience</h3>
        ${jobsMarkup}
      </section>
      <section class="resume-section-block">
        <h3>Skills</h3>
        ${skillMarkup || "<p class='text-secondary'>No skills added yet.</p>"}
      </section>
      <section class="resume-section-block">
        <h3>Certifications</h3>
        ${certificationMarkup}
      </section>
      <section class="resume-section-block">
        <h3>Awards</h3>
        ${awardsMarkup}
      </section>
    </div>
  `;
}

async function loadDashboard() {
  const data = await apiRequest("/api/dashboard");
  state.dashboard = data;
  renderStats();
  renderResumeVersionOptions();
}

async function loadResumeVersionDetails(resumeVersionId) {
  if (!resumeVersionId) {
    state.activeResumeVersionId = null;
    state.activeResumeData = null;
    renderSelectionBuilder();
    renderPreview();
    return;
  }

  const data = await apiRequest(`/api/resume-versions/${resumeVersionId}`);
  state.activeResumeVersionId = Number(resumeVersionId);
  state.activeResumeData = data;
  renderSelectionBuilder();
  renderPreview();
}

document.getElementById("jobForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const responsibilities = document
    .getElementById("jobResponsibilities")
    .value.split("\n")
    .map((item) => item.trim())
    .filter(Boolean);

  try {
    await apiRequest("/api/jobs", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("jobTitle").value.trim(),
        company: document.getElementById("jobCompany").value.trim(),
        location: document.getElementById("jobLocation").value.trim(),
        startDate: document.getElementById("jobStartDate").value,
        endDate: document.getElementById("jobEndDate").value,
        summary: document.getElementById("jobSummary").value.trim(),
        responsibilities
      })
    });

    event.target.reset();
    await loadDashboard();
    showToast("Job saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("skillForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await apiRequest("/api/skills", {
      method: "POST",
      body: JSON.stringify({
        category: document.getElementById("skillCategory").value.trim(),
        name: document.getElementById("skillName").value.trim(),
        level: document.getElementById("skillLevel").value.trim()
      })
    });

    event.target.reset();
    await loadDashboard();
    showToast("Skill saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("certificationForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await apiRequest("/api/certifications", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("certificationName").value.trim(),
        issuer: document.getElementById("certificationIssuer").value.trim(),
        issueDate: document.getElementById("certificationDate").value,
        details: document.getElementById("certificationDetails").value.trim()
      })
    });

    event.target.reset();
    await loadDashboard();
    showToast("Certification saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("awardForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    await apiRequest("/api/awards", {
      method: "POST",
      body: JSON.stringify({
        title: document.getElementById("awardTitle").value.trim(),
        issuer: document.getElementById("awardIssuer").value.trim(),
        awardDate: document.getElementById("awardDate").value,
        details: document.getElementById("awardDetails").value.trim()
      })
    });

    event.target.reset();
    await loadDashboard();
    showToast("Award saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("resumeVersionForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  try {
    const data = await apiRequest("/api/resume-versions", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("resumeVersionName").value.trim(),
        targetRole: document.getElementById("resumeTargetRole").value.trim(),
        professionalSummary: document.getElementById("resumeSummary").value.trim()
      })
    });

    event.target.reset();
    await loadDashboard();
    resumeVersionSelect.value = String(data.id);
    await loadResumeVersionDetails(data.id);
    showToast("Resume version created.");
  } catch (error) {
    showToast(error.message, true);
  }
});

resumeVersionSelect.addEventListener("change", async (event) => {
  try {
    await loadResumeVersionDetails(event.target.value);
  } catch (error) {
    showToast(error.message, true);
  }
});

selectionBuilder.addEventListener("change", () => {
  if (!state.activeResumeData) {
    return;
  }

  state.activeResumeData.selectedJobIds = Array.from(document.querySelectorAll(".job-checkbox:checked")).map((element) =>
    Number(element.value)
  );

  state.activeResumeData.selectedResponsibilityIds = Array.from(
    document.querySelectorAll(".responsibility-checkbox:checked")
  ).map((element) => Number(element.value));

  renderPreview();
});

saveSelectionsButton.addEventListener("click", async () => {
  if (!state.activeResumeVersionId || !state.activeResumeData) {
    return;
  }

  try {
    await apiRequest(`/api/resume-versions/${state.activeResumeVersionId}/selections`, {
      method: "POST",
      body: JSON.stringify({
        selectedJobIds: state.activeResumeData.selectedJobIds,
        selectedResponsibilityIds: state.activeResumeData.selectedResponsibilityIds
      })
    });

    showToast("Resume selections saved.");
  } catch (error) {
    showToast(error.message, true);
  }
});

document.getElementById("digitalViewButton").addEventListener("click", () => {
  state.previewMode = "digital";
  renderPreview();
});

document.getElementById("printViewButton").addEventListener("click", () => {
  state.previewMode = "print";
  renderPreview();
});

document.getElementById("printResumeButton").addEventListener("click", () => {
  window.print();
});

document.getElementById("aiReviewForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  aiResponse.textContent = "Reviewing content with Gemini...";

  try {
    const data = await apiRequest("/api/ai/review", {
      method: "POST",
      body: JSON.stringify({
        context: document.getElementById("aiContext").value.trim(),
        text: document.getElementById("aiText").value.trim()
      })
    });

    aiResponse.textContent = data.suggestion;

    if (data.fallback) {
      showToast("Gemini service was unavailable, so a demo was shown instead.", true);
    } else {
      showToast("Gemini review completed.");
    }
  } catch (error) {
    aiResponse.textContent = error.message;
    showToast(error.message, true);
  }
});

async function initializeApp() {
  try {
    await loadDashboard();
    renderSelectionBuilder();
    renderPreview();
  } catch (error) {
    showToast("Unable to initialize the app.", true);
  }
}

initializeApp();
