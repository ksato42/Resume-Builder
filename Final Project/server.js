const path = require("path");
const fs = require("fs");
const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const dbPath = path.join(__dirname, "resume-builder.db");
const db = new sqlite3.Database(dbPath);

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use(
  "/vendor/bootstrap",
  express.static(path.join(__dirname, "node_modules", "bootstrap", "dist"))
);

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function onRun(error) {
      if (error) {
        reject(error);
        return;
      }
      resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (error, rows) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(rows);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (error, row) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(row);
    });
  });
}

function initializeDatabase() {
  const schema = `
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      company TEXT NOT NULL,
      location TEXT,
      start_date TEXT,
      end_date TEXT,
      summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS responsibilities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS skills (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      name TEXT NOT NULL,
      level TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS certifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      issuer TEXT,
      issue_date TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS awards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      issuer TEXT,
      award_date TEXT,
      details TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resume_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_role TEXT,
      professional_summary TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resume_job_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL,
      job_id INTEGER NOT NULL,
      selected INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (resume_version_id) REFERENCES resume_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE,
      UNIQUE (resume_version_id, job_id)
    );

    CREATE TABLE IF NOT EXISTS resume_responsibility_selections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      resume_version_id INTEGER NOT NULL,
      responsibility_id INTEGER NOT NULL,
      selected INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (resume_version_id) REFERENCES resume_versions(id) ON DELETE CASCADE,
      FOREIGN KEY (responsibility_id) REFERENCES responsibilities(id) ON DELETE CASCADE,
      UNIQUE (resume_version_id, responsibility_id)
    );
  `;

  db.exec(schema, (error) => {
    if (error) {
      console.error("Failed to initialize database:", error);
      process.exit(1);
    }
  });
}

function buildResumeSnapshot(rows) {
  const jobsMap = new Map();
  const skillsByCategory = {};
  const certifications = [];
  const awards = [];

  rows.jobs.forEach((row) => {
    if (!jobsMap.has(row.id)) {
      jobsMap.set(row.id, {
        id: row.id,
        title: row.title,
        company: row.company,
        location: row.location,
        startDate: row.start_date,
        endDate: row.end_date,
        summary: row.summary,
        responsibilities: []
      });
    }

    if (row.responsibility_id) {
      jobsMap.get(row.id).responsibilities.push({
        id: row.responsibility_id,
        description: row.responsibility_description
      });
    }
  });

  rows.skills.forEach((skill) => {
    if (!skillsByCategory[skill.category]) {
      skillsByCategory[skill.category] = [];
    }

    skillsByCategory[skill.category].push({
      id: skill.id,
      name: skill.name,
      level: skill.level
    });
  });

  rows.certifications.forEach((item) => {
    certifications.push({
      id: item.id,
      name: item.name,
      issuer: item.issuer,
      issueDate: item.issue_date,
      details: item.details
    });
  });

  rows.awards.forEach((item) => {
    awards.push({
      id: item.id,
      title: item.title,
      issuer: item.issuer,
      awardDate: item.award_date,
      details: item.details
    });
  });

  return {
    jobs: Array.from(jobsMap.values()),
    skillsByCategory,
    certifications,
    awards
  };
}

function buildFallbackReview(text, context) {
  const cleanedText = String(text || "").trim();
  const normalizedText = cleanedText.replace(/\s+/g, " ");
  const polishedRewrite = normalizedText
    ? normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1)
    : "Add a stronger accomplishment-focused statement here.";

  const suggestions = [
    "Start with a strong action verb and describe what you achieved.",
    "Add specific tools, technologies, or measurable results where possible.",
    "Tailor the wording to the target role and keep the sentence concise."
  ];

  const contextLine = context ? `Target context: ${context}` : "Target context: General resume writing";

  return [
    "Demo Mode",
    "Gemini service was unavailable, so this local backup suggestion was generated.",
    "",
    contextLine,
    "",
    "Polished rewrite:",
    polishedRewrite,
    "",
    "Improvement suggestions:",
    `1. ${suggestions[0]}`,
    `2. ${suggestions[1]}`,
    `3. ${suggestions[2]}`,
    "",
    "What changed:",
    "The text was normalized for tone and clarity, and the suggestions focus on stronger action verbs, measurable impact, and better alignment with the target job."
  ].join("\n");
}

async function fetchDashboardData() {
  const [jobs, skills, certifications, awards, resumeVersions] = await Promise.all([
    all(`
      SELECT
        jobs.*,
        responsibilities.id AS responsibility_id,
        responsibilities.description AS responsibility_description
      FROM jobs
      LEFT JOIN responsibilities ON responsibilities.job_id = jobs.id
      ORDER BY jobs.created_at DESC, responsibilities.id ASC
    `),
    all("SELECT * FROM skills ORDER BY category ASC, name ASC"),
    all("SELECT * FROM certifications ORDER BY created_at DESC"),
    all("SELECT * FROM awards ORDER BY created_at DESC"),
    all("SELECT * FROM resume_versions ORDER BY created_at DESC")
  ]);

  return { jobs, skills, certifications, awards, resumeVersions };
}

app.get("/api/dashboard", async (request, response) => {
  try {
    const data = await fetchDashboardData();
    response.json(data);
  } catch (error) {
    response.status(500).json({ error: "Unable to load dashboard data." });
  }
});

app.post("/api/jobs", async (request, response) => {
  const { title, company, location, startDate, endDate, summary, responsibilities = [] } = request.body;

  if (!title || !company) {
    response.status(400).json({ error: "Job title and company are required." });
    return;
  }

  try {
    const result = await run(
      `
        INSERT INTO jobs (title, company, location, start_date, end_date, summary)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [title, company, location || "", startDate || "", endDate || "", summary || ""]
    );

    const cleanedResponsibilities = responsibilities
      .map((item) => String(item).trim())
      .filter(Boolean);

    await Promise.all(
      cleanedResponsibilities.map((description) =>
        run("INSERT INTO responsibilities (job_id, description) VALUES (?, ?)", [result.id, description])
      )
    );

    response.status(201).json({ success: true, id: result.id });
  } catch (error) {
    response.status(500).json({ error: "Unable to save job." });
  }
});

app.post("/api/skills", async (request, response) => {
  const { category, name, level } = request.body;

  if (!category || !name) {
    response.status(400).json({ error: "Skill category and name are required." });
    return;
  }

  try {
    const result = await run(
      "INSERT INTO skills (category, name, level) VALUES (?, ?, ?)",
      [category, name, level || ""]
    );
    response.status(201).json({ success: true, id: result.id });
  } catch (error) {
    response.status(500).json({ error: "Unable to save skill." });
  }
});

app.post("/api/certifications", async (request, response) => {
  const { name, issuer, issueDate, details } = request.body;

  if (!name) {
    response.status(400).json({ error: "Certification name is required." });
    return;
  }

  try {
    const result = await run(
      "INSERT INTO certifications (name, issuer, issue_date, details) VALUES (?, ?, ?, ?)",
      [name, issuer || "", issueDate || "", details || ""]
    );
    response.status(201).json({ success: true, id: result.id });
  } catch (error) {
    response.status(500).json({ error: "Unable to save certification." });
  }
});

app.post("/api/awards", async (request, response) => {
  const { title, issuer, awardDate, details } = request.body;

  if (!title) {
    response.status(400).json({ error: "Award title is required." });
    return;
  }

  try {
    const result = await run(
      "INSERT INTO awards (title, issuer, award_date, details) VALUES (?, ?, ?, ?)",
      [title, issuer || "", awardDate || "", details || ""]
    );
    response.status(201).json({ success: true, id: result.id });
  } catch (error) {
    response.status(500).json({ error: "Unable to save award." });
  }
});

app.post("/api/resume-versions", async (request, response) => {
  const { name, targetRole, professionalSummary } = request.body;

  if (!name) {
    response.status(400).json({ error: "Resume version name is required." });
    return;
  }

  try {
    const result = await run(
      `
        INSERT INTO resume_versions (name, target_role, professional_summary)
        VALUES (?, ?, ?)
      `,
      [name, targetRole || "", professionalSummary || ""]
    );

    response.status(201).json({ success: true, id: result.id });
  } catch (error) {
    response.status(500).json({ error: "Unable to save resume version." });
  }
});

app.get("/api/resume-versions/:id", async (request, response) => {
  try {
    const resumeVersion = await get("SELECT * FROM resume_versions WHERE id = ?", [request.params.id]);

    if (!resumeVersion) {
      response.status(404).json({ error: "Resume version not found." });
      return;
    }

    const [jobs, skills, certifications, awards, selectedJobs, selectedResponsibilities] = await Promise.all([
      all(`
        SELECT
          jobs.*,
          responsibilities.id AS responsibility_id,
          responsibilities.description AS responsibility_description
        FROM jobs
        LEFT JOIN responsibilities ON responsibilities.job_id = jobs.id
        ORDER BY jobs.created_at DESC, responsibilities.id ASC
      `),
      all("SELECT * FROM skills ORDER BY category ASC, name ASC"),
      all("SELECT * FROM certifications ORDER BY created_at DESC"),
      all("SELECT * FROM awards ORDER BY created_at DESC"),
      all(
        "SELECT job_id FROM resume_job_selections WHERE resume_version_id = ? AND selected = 1",
        [request.params.id]
      ),
      all(
        "SELECT responsibility_id FROM resume_responsibility_selections WHERE resume_version_id = ? AND selected = 1",
        [request.params.id]
      )
    ]);

    response.json({
      resumeVersion,
      selectedJobIds: selectedJobs.map((row) => row.job_id),
      selectedResponsibilityIds: selectedResponsibilities.map((row) => row.responsibility_id),
      snapshot: buildResumeSnapshot({ jobs, skills, certifications, awards })
    });
  } catch (error) {
    response.status(500).json({ error: "Unable to load resume version." });
  }
});

app.post("/api/resume-versions/:id/selections", async (request, response) => {
  const { selectedJobIds = [], selectedResponsibilityIds = [] } = request.body;
  const resumeVersionId = Number(request.params.id);

  try {
    await run("DELETE FROM resume_job_selections WHERE resume_version_id = ?", [resumeVersionId]);
    await run("DELETE FROM resume_responsibility_selections WHERE resume_version_id = ?", [resumeVersionId]);

    await Promise.all(
      selectedJobIds.map((jobId) =>
        run(
          "INSERT INTO resume_job_selections (resume_version_id, job_id, selected) VALUES (?, ?, 1)",
          [resumeVersionId, jobId]
        )
      )
    );

    await Promise.all(
      selectedResponsibilityIds.map((responsibilityId) =>
        run(
          `
            INSERT INTO resume_responsibility_selections (resume_version_id, responsibility_id, selected)
            VALUES (?, ?, 1)
          `,
          [resumeVersionId, responsibilityId]
        )
      )
    );

    response.json({ success: true });
  } catch (error) {
    response.status(500).json({ error: "Unable to save selections." });
  }
});

app.post("/api/ai/review", async (request, response) => {
  const { text, context } = request.body;
  const apiKey = process.env.GEMINI_API_KEY;
  const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";

  if (!text) {
    response.status(400).json({ error: "Text is required for AI review." });
    return;
  }

  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    response.status(400).json({ error: "Set GEMINI_API_KEY in the .env file before using AI review." });
    return;
  }

  try {
    const prompt = [
      "You are an expert resume writing assistant.",
      "Review the following resume content and return:",
      "1. A polished rewrite.",
      "2. Three short improvement suggestions.",
      "3. A concise explanation of what changed.",
      "",
      `Context: ${context || "General resume writing."}`,
      "",
      "Resume text:",
      text
    ].join("\n");

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }]
            }
          ]
        })
      }
    );

    if (geminiResponse.status === 429) {
      response.json({
        suggestion: buildFallbackReview(text, context),
        fallback: true,
        reason: "quota_exceeded"
      });
      return;
    }

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      response.status(502).json({ error: `Gemini request failed: ${errorText}` });
      return;
    }

    const data = await geminiResponse.json();
    const aiText =
      data.candidates?.[0]?.content?.parts?.map((part) => part.text).join("\n").trim() ||
      "No suggestions were returned.";

    response.json({ suggestion: aiText, fallback: false });
  } catch (error) {
    response.status(500).json({ error: "Unable to contact Gemini API." });
  }
});

app.get(/.*/, (request, response) => {
  const indexPath = path.join(__dirname, "index.html");

  if (!fs.existsSync(indexPath)) {
    response.status(404).send("index.html not found.");
    return;
  }

  response.sendFile(indexPath);
});

initializeDatabase();

app.listen(PORT, () => {
  console.log(`Resume Builder server running on http://localhost:${PORT}`);
});
