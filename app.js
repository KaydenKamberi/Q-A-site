const express = require("express");
const bcrypt = require("bcrypt");
const session = require("express-session");
const path = require("path");
const { checkDatabaseConnection, getPool } = require("./db");

const app = express();
const port = Number(process.env.PORT || 5000);
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required before starting the app.");
}

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));
app.use(
  session({
    secret: sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 1000 * 60 * 60 * 24 * 7
    }
  })
);

app.use((req, res, next) => {
  res.locals.currentUser = req.session.uid_user
    ? {
        uid_user: req.session.uid_user,
        uName: req.session.uName
      }
    : null;
  next();
});

let databaseStatus = {
  ok: false,
  message: "Database check has not run yet."
};

function requireLogin(req, res, next) {
  if (!req.session.uid_user) {
    return res.redirect("/login");
  }

  next();
}

function renderRegister(res, values = {}, error = null) {
  return res.status(error ? 400 : 200).render("register", {
    values,
    error
  });
}

function renderLogin(res, values = {}, error = null, notice = null) {
  return res.status(error ? 400 : 200).render("login", {
    values,
    error,
    notice
  });
}

app.get("/", (req, res) => {
  (async () => {
    try {
      const pool = getPool();
      const [questions] = await pool.execute(`
        SELECT
          q.question_id,
          q.title,
          q.body,
          q.created_at,
          q.updated_at,
          u.uName,
          COUNT(a.answer_id) AS answer_count
        FROM QA1_Questions AS q
        INNER JOIN QA1_Users AS u
          ON q.uid_user = u.uid_user
        LEFT JOIN QA1_Answers AS a
          ON q.question_id = a.question_id
        GROUP BY
          q.question_id,
          q.title,
          q.body,
          q.created_at,
          q.updated_at,
          u.uName
        ORDER BY q.created_at DESC, q.question_id DESC
      `);

      res.render("index", { databaseStatus, questions });
    } catch (error) {
      console.error(`Question list failed: ${error.code || "UNKNOWN_ERROR"}`);
      res.status(500).render("error", {
        title: "Questions unavailable",
        message: "We could not load the questions right now."
      });
    }
  })();
});

function parseQuestionId(value) {
  const questionId = Number(value);
  return Number.isInteger(questionId) && questionId > 0 ? questionId : null;
}

function renderQuestionForm(res, mode, values = {}, error = null) {
  return res.status(error ? 400 : 200).render("question-form", {
    mode,
    values,
    error
  });
}

function renderAnswerForm(res, values = {}, error = null) {
  return res.status(error ? 400 : 200).render("answer-form", {
    values,
    error
  });
}

function renderForbidden(res, message) {
  return res.status(403).render("error", {
    title: "Not allowed",
    message
  });
}

async function loadQuestionWithAnswers(questionId) {
  const pool = getPool();
  const [questionRows] = await pool.execute(
    `SELECT
       q.question_id,
       q.uid_user,
       q.title,
       q.body,
       q.created_at,
       q.updated_at,
       u.uName
     FROM QA1_Questions AS q
     INNER JOIN QA1_Users AS u
       ON q.uid_user = u.uid_user
     WHERE q.question_id = ?
     LIMIT 1`,
    [questionId]
  );

  if (!questionRows[0]) {
    return null;
  }

  const [answers] = await pool.execute(
    `SELECT
       a.answer_id,
       a.question_id,
       a.uid_user,
       a.body,
       a.created_at,
       a.updated_at,
       u.uName
     FROM QA1_Answers AS a
     INNER JOIN QA1_Users AS u
       ON a.uid_user = u.uid_user
     WHERE a.question_id = ?
     ORDER BY a.created_at ASC, a.answer_id ASC`,
    [questionId]
  );

  return {
    question: questionRows[0],
    answers
  };
}

app.get("/questions/new", requireLogin, (req, res) => {
  renderQuestionForm(res, "new");
});

app.post("/questions", requireLogin, async (req, res) => {
  const values = {
    title: String(req.body.title || "").trim(),
    body: String(req.body.body || "").trim()
  };

  if (values.title.length < 1 || values.title.length > 150) {
    return renderQuestionForm(
      res,
      "new",
      values,
      "Question title must be between 1 and 150 characters."
    );
  }

  if (!values.body) {
    return renderQuestionForm(
      res,
      "new",
      values,
      "Question body cannot be empty."
    );
  }

  try {
    const pool = getPool();
    const [result] = await pool.execute(
      "INSERT INTO QA1_Questions (uid_user, title, body) VALUES (?, ?, ?)",
      [req.session.uid_user, values.title, values.body]
    );

    res.redirect(`/questions/${result.insertId}`);
  } catch (error) {
    console.error(`Question creation failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Question error",
      message: "We could not create your question right now."
    });
  }
});

app.get("/questions/:id", async (req, res) => {
  const questionId = parseQuestionId(req.params.id);

  if (!questionId) {
    return res.status(404).render("error", {
      title: "Question not found",
      message: "That question does not exist."
    });
  }

  try {
    const pageData = await loadQuestionWithAnswers(questionId);

    if (!pageData) {
      return res.status(404).render("error", {
        title: "Question not found",
        message: "That question does not exist."
      });
    }

    res.render("question-detail", {
      ...pageData,
      answerError: null,
      answerDraft: ""
    });
  } catch (error) {
    console.error(`Question load failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Question unavailable",
      message: "We could not load that question right now."
    });
  }
});

app.post("/questions/:id/answers", requireLogin, async (req, res) => {
  const questionId = parseQuestionId(req.params.id);
  const values = {
    question_id: questionId,
    body: String(req.body.body || "").trim()
  };

  if (!questionId) {
    return res.status(404).render("error", {
      title: "Question not found",
      message: "That question does not exist."
    });
  }

  if (!values.body) {
    try {
      const pageData = await loadQuestionWithAnswers(questionId);

      if (!pageData) {
        return res.status(404).render("error", {
          title: "Question not found",
          message: "That question does not exist."
        });
      }

      return res.status(400).render("question-detail", {
        ...pageData,
        answerError: "Answer body cannot be empty.",
        answerDraft: values.body
      });
    } catch (error) {
      console.error(`Answer form load failed: ${error.code || "UNKNOWN_ERROR"}`);
      return res.status(500).render("error", {
        title: "Answer error",
        message: "We could not load the answer form right now."
      });
    }
  }

  try {
    const pool = getPool();
    const [questionRows] = await pool.execute(
      "SELECT question_id FROM QA1_Questions WHERE question_id = ? LIMIT 1",
      [questionId]
    );

    if (!questionRows[0]) {
      return res.status(404).render("error", {
        title: "Question not found",
        message: "That question does not exist."
      });
    }

    await pool.execute(
      "INSERT INTO QA1_Answers (question_id, uid_user, body) VALUES (?, ?, ?)",
      [questionId, req.session.uid_user, values.body]
    );

    res.redirect(`/questions/${questionId}`);
  } catch (error) {
    console.error(`Answer creation failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Answer error",
      message: "We could not post your answer right now."
    });
  }
});

app.get("/answers/:id/edit", requireLogin, async (req, res) => {
  const answerId = parseQuestionId(req.params.id);

  if (!answerId) {
    return renderForbidden(res, "You cannot edit that answer.");
  }

  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT answer_id, question_id, body
       FROM QA1_Answers
       WHERE answer_id = ? AND uid_user = ?
       LIMIT 1`,
      [answerId, req.session.uid_user]
    );

    if (!rows[0]) {
      return renderForbidden(res, "Only the answer owner can edit it.");
    }

    renderAnswerForm(res, rows[0]);
  } catch (error) {
    console.error(`Answer edit load failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Answer unavailable",
      message: "We could not load the answer form right now."
    });
  }
});

app.post("/answers/:id/edit", requireLogin, async (req, res) => {
  const answerId = parseQuestionId(req.params.id);
  const values = {
    answer_id: answerId,
    body: String(req.body.body || "").trim()
  };

  if (!values.body) {
    return renderAnswerForm(res, values, "Answer body cannot be empty.");
  }

  if (!answerId) {
    return renderForbidden(res, "You cannot edit that answer.");
  }

  try {
    const pool = getPool();
    const [answerRows] = await pool.execute(
      `SELECT question_id
       FROM QA1_Answers
       WHERE answer_id = ? AND uid_user = ?
       LIMIT 1`,
      [answerId, req.session.uid_user]
    );

    if (!answerRows[0]) {
      return renderForbidden(res, "Only the answer owner can edit it.");
    }

    const [result] = await pool.execute(
      `UPDATE QA1_Answers
       SET body = ?
       WHERE answer_id = ? AND uid_user = ?`,
      [values.body, answerId, req.session.uid_user]
    );

    if (result.affectedRows === 0) {
      return renderForbidden(res, "Only the answer owner can edit it.");
    }

    res.redirect(`/questions/${answerRows[0].question_id}`);
  } catch (error) {
    console.error(`Answer update failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Answer error",
      message: "We could not update your answer right now."
    });
  }
});

app.post("/answers/:id/delete", requireLogin, async (req, res) => {
  const answerId = parseQuestionId(req.params.id);

  if (!answerId) {
    return renderForbidden(res, "You cannot delete that answer.");
  }

  try {
    const pool = getPool();
    const [answerRows] = await pool.execute(
      `SELECT question_id
       FROM QA1_Answers
       WHERE answer_id = ? AND uid_user = ?
       LIMIT 1`,
      [answerId, req.session.uid_user]
    );

    if (!answerRows[0]) {
      return renderForbidden(res, "Only the answer owner can delete it.");
    }

    const [result] = await pool.execute(
      "DELETE FROM QA1_Answers WHERE answer_id = ? AND uid_user = ?",
      [answerId, req.session.uid_user]
    );

    if (result.affectedRows === 0) {
      return renderForbidden(res, "Only the answer owner can delete it.");
    }

    res.redirect(`/questions/${answerRows[0].question_id}`);
  } catch (error) {
    console.error(`Answer deletion failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Answer error",
      message: "We could not delete your answer right now."
    });
  }
});

app.get("/questions/:id/edit", requireLogin, async (req, res) => {
  const questionId = parseQuestionId(req.params.id);

  if (!questionId) {
    return renderForbidden(res, "You cannot edit that question.");
  }

  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT question_id, title, body
       FROM QA1_Questions
       WHERE question_id = ? AND uid_user = ?
       LIMIT 1`,
      [questionId, req.session.uid_user]
    );

    if (!rows[0]) {
      return renderForbidden(res, "Only the question owner can edit it.");
    }

    renderQuestionForm(res, "edit", rows[0]);
  } catch (error) {
    console.error(`Question edit load failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Question unavailable",
      message: "We could not load the edit form right now."
    });
  }
});

app.post("/questions/:id/edit", requireLogin, async (req, res) => {
  const questionId = parseQuestionId(req.params.id);
  const values = {
    question_id: questionId,
    title: String(req.body.title || "").trim(),
    body: String(req.body.body || "").trim()
  };

  if (values.title.length < 1 || values.title.length > 150) {
    return renderQuestionForm(
      res,
      "edit",
      values,
      "Question title must be between 1 and 150 characters."
    );
  }

  if (!values.body) {
    return renderQuestionForm(
      res,
      "edit",
      values,
      "Question body cannot be empty."
    );
  }

  if (!questionId) {
    return renderForbidden(res, "You cannot edit that question.");
  }

  try {
    const pool = getPool();
    const [result] = await pool.execute(
      `UPDATE QA1_Questions
       SET title = ?, body = ?
       WHERE question_id = ? AND uid_user = ?`,
      [values.title, values.body, questionId, req.session.uid_user]
    );

    if (result.affectedRows === 0) {
      return renderForbidden(res, "Only the question owner can edit it.");
    }

    res.redirect(`/questions/${questionId}`);
  } catch (error) {
    console.error(`Question update failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Question error",
      message: "We could not update your question right now."
    });
  }
});

app.post("/questions/:id/delete", requireLogin, async (req, res) => {
  const questionId = parseQuestionId(req.params.id);

  if (!questionId) {
    return renderForbidden(res, "You cannot delete that question.");
  }

  try {
    const pool = getPool();
    const [result] = await pool.execute(
      "DELETE FROM QA1_Questions WHERE question_id = ? AND uid_user = ?",
      [questionId, req.session.uid_user]
    );

    if (result.affectedRows === 0) {
      return renderForbidden(res, "Only the question owner can delete it.");
    }

    res.redirect("/");
  } catch (error) {
    console.error(`Question deletion failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Question error",
      message: "We could not delete your question right now."
    });
  }
});

app.get("/register", (req, res) => {
  if (req.session.uid_user) {
    return res.redirect("/");
  }

  renderRegister(res);
});

app.post("/register", async (req, res) => {
  const values = {
    username: String(req.body.username || "").trim(),
    email: String(req.body.email || "").trim()
  };
  const password = String(req.body.password || "");

  if (values.username.length < 3 || values.username.length > 25) {
    return renderRegister(
      res,
      values,
      "Username must be between 3 and 25 characters."
    );
  }

  if (
    values.email.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
  ) {
    return renderRegister(res, values, "Enter a valid email address.");
  }

  if (password.length < 8) {
    return renderRegister(
      res,
      values,
      "Password must be at least 8 characters."
    );
  }

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const pool = getPool();

    await pool.execute(
      "INSERT INTO QA1_Users (uName, password, email, registerdate) VALUES (?, ?, ?, NOW())",
      [values.username, passwordHash, values.email]
    );

    res.redirect("/login?registered=1");
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return renderRegister(
        res,
        values,
        "That username or email is already registered."
      );
    }

    console.error(`Registration failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Registration error",
      message: "We could not create your account right now."
    });
  }
});

app.get("/login", (req, res) => {
  if (req.session.uid_user) {
    return res.redirect("/");
  }

  const notice =
    req.query.registered === "1"
      ? "Account created. You can log in now."
      : null;
  renderLogin(res, {}, null, notice);
});

app.post("/login", async (req, res) => {
  const values = {
    username: String(req.body.username || "").trim()
  };
  const password = String(req.body.password || "");

  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      "SELECT uid_user, uName, password FROM QA1_Users WHERE uName = ? LIMIT 1",
      [values.username]
    );
    const user = rows[0];
    const passwordMatches = user
      ? await bcrypt.compare(password, user.password)
      : false;

    if (!passwordMatches) {
      return renderLogin(res, values, "Invalid username or password.");
    }

    req.session.regenerate((error) => {
      if (error) {
        console.error("Session creation failed.");
        return res.status(500).render("error", {
          title: "Login error",
          message: "We could not start your session right now."
        });
      }

      req.session.uid_user = user.uid_user;
      req.session.uName = user.uName;
      res.redirect("/");
    });
  } catch (error) {
    console.error(`Login failed: ${error.code || "UNKNOWN_ERROR"}`);
    res.status(500).render("error", {
      title: "Login error",
      message: "We could not log you in right now."
    });
  }
});

app.post("/logout", requireLogin, (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      console.error("Session destruction failed.");
      return res.status(500).render("error", {
        title: "Logout error",
        message: "We could not log you out right now."
      });
    }

    res.clearCookie("connect.sid");
    res.redirect("/");
  });
});

app.get("/health", (req, res) => {
  res.status(databaseStatus.ok ? 200 : 503).json({
    app: "ok",
    database: databaseStatus.ok ? "connected" : "not connected"
  });
});

async function start() {
  databaseStatus = await checkDatabaseConnection();

  app.listen(port, "0.0.0.0", () => {
    console.log(`Q&A app listening on port ${port}`);
  });
}

if (require.main === module) {
  start();
}

module.exports = app;