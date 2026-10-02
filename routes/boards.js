const express = require("express");
const { getPool } = require("../db");
const {
  validateBoardInput,
  parseRules,
  canEditBoard,
  canDeleteBoard
} = require("../lib/boards/index.js");

// Mounted at "/" in app.js; the logic module and board views belong to the
// other agents. The callback keeps the existing home-view status up to date.
function createBoardRouter({ getDatabaseStatus }) {
  if (typeof getDatabaseStatus !== "function") {
    throw new TypeError("getDatabaseStatus must be a function.");
  }

  const router = express.Router();

  router.use((req, res, next) => {
    res.locals.user = req.session.uid_user
      ? { uid_user: req.session.uid_user, uName: req.session.uName }
      : null;
    next();
  });

  function requireLogin(req, res, next) {
    if (!req.session.uid_user) return res.redirect("/login");
    next();
  }

  function notFound(res) {
    return res.status(404).render("error", {
      title: "Board not found",
      message: "That board does not exist."
    });
  }

  function forbidden(res) {
    return res.status(403).render("error", {
      title: "Not allowed",
      message: "You cannot change or delete this board."
    });
  }

  function handle(handler) {
    return async (req, res) => {
      try {
        await handler(req, res);
      } catch (error) {
        console.error(`Board operation failed: ${error.code || "UNKNOWN_ERROR"}`);
        return res.status(500).render("error", {
          title: "Boards unavailable",
          message: "We could not complete that board request right now."
        });
      }
    };
  }

  async function loadBoard(req, res, next) {
    try {
      const name = String(req.params.name).toLowerCase();
      const [rows] = await getPool().execute(
        `SELECT b.board_id, b.name, b.title, b.description, b.rules,
                b.creator_id, b.created_at, u.uName AS creator_uName
         FROM QA1_Boards AS b
         JOIN QA1_Users AS u ON u.uid_user = b.creator_id
         WHERE b.name = ? LIMIT 1`,
        [name]
      );
      if (!rows[0]) return notFound(res);
      req.board = rows[0];
      next();
    } catch (error) {
      console.error(`Board lookup failed: ${error.code || "UNKNOWN_ERROR"}`);
      return res.status(500).render("error", {
        title: "Board unavailable",
        message: "We could not load that board right now."
      });
    }
  }

  function creatorOnly(req, res, next) {
    if (!canEditBoard(req.session.uid_user, req.board)) return forbidden(res);
    next();
  }

  function deleteAllowed(req, res, next) {
    if (!canDeleteBoard(req.session.uid_user, req.board)) return forbidden(res);
    next();
  }

  function boardInput(body) {
    return {
      name: String(body.name || ""),
      title: String(body.title || ""),
      description: String(body.description || "").trim(),
      rules: String(body.rules || "").trim()
    };
  }

  async function questionCount(boardId) {
    const [rows] = await getPool().execute(
      "SELECT COUNT(*) AS question_count FROM QA1_Questions WHERE board_id = ? AND room_id IS NULL",
      [boardId]
    );
    return rows[0].question_count;
  }

  router.get("/", handle(async (req, res) => {
    const [questions] = await getPool().execute(
      `SELECT q.question_id, q.title, q.body, q.created_at, q.updated_at,
              u.uName, b.name AS board_name, b.title AS board_title,
              COUNT(a.answer_id) AS answer_count
       FROM QA1_Questions AS q
       JOIN QA1_Boards AS b ON b.board_id = q.board_id
       JOIN QA1_Users AS u ON u.uid_user = q.uid_user
       LEFT JOIN QA1_Answers AS a ON a.question_id = q.question_id
       WHERE q.room_id IS NULL
       GROUP BY q.question_id, q.title, q.body, q.created_at, q.updated_at,
                u.uName, b.name, b.title
       ORDER BY q.created_at DESC, q.question_id DESC`
    );
    return res.render("index", { questions, databaseStatus: getDatabaseStatus() });
  }));

  router.get("/boards", handle(async (req, res) => {
    const [boards] = await getPool().execute(
      `SELECT b.name, b.title, b.description, COUNT(q.question_id) AS question_count
       FROM QA1_Boards AS b
       LEFT JOIN QA1_Questions AS q ON q.board_id = b.board_id AND q.room_id IS NULL
       GROUP BY b.board_id, b.name, b.title, b.description
       ORDER BY b.name ASC`
    );
    return res.render("boards/index", { boards });
  }));

  router.get("/boards/new", requireLogin, (req, res) => {
    return res.render("boards/form", {
      mode: "create",
      values: { name: "", title: "", description: "", rules: "" },
      errors: {}
    });
  });

  router.post("/boards", requireLogin, handle(async (req, res) => {
    const values = boardInput(req.body);
    const result = validateBoardInput(values, { isEdit: false });
    if (!result.ok) {
      return res.status(400).render("boards/form", {
        mode: "create", values, errors: result.errors
      });
    }
    const board = result.value;
    try {
      await getPool().execute(
        `INSERT INTO QA1_Boards (name, title, description, rules, creator_id)
         VALUES (?, ?, ?, ?, ?)`,
        [board.name, board.title, board.description, board.rules, req.session.uid_user]
      );
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
      return res.status(400).render("boards/form", {
        mode: "create", values, errors: { name: "That board name is taken" }
      });
    }
    return res.redirect(`/b/${board.name}`);
  }));

  router.get("/questions/new", (req, res) => {
    return res.redirect("/b/general/questions/new");
  });

  router.get("/b/:name", loadBoard, handle(async (req, res) => {
    const [questions] = await getPool().execute(
      `SELECT q.question_id, q.title, u.uName, q.created_at,
              COUNT(a.answer_id) AS answer_count
       FROM QA1_Questions AS q
       JOIN QA1_Users AS u ON u.uid_user = q.uid_user
       LEFT JOIN QA1_Answers AS a ON a.question_id = q.question_id
       WHERE q.board_id = ? AND q.room_id IS NULL
       GROUP BY q.question_id, q.title, u.uName, q.created_at
       ORDER BY q.created_at DESC, q.question_id DESC`,
      [req.board.board_id]
    );
    return res.render("boards/show", {
      board: { ...req.board, rules_list: parseRules(req.board.rules) },
      questions,
      canEdit: canEditBoard(req.session.uid_user, req.board),
      canDelete: canDeleteBoard(req.session.uid_user, req.board)
    });
  }));

  router.get("/b/:name/questions/new", loadBoard, requireLogin, (req, res) => {
    return res.render("boards/new-question", {
      board: req.board, values: { title: "", body: "" }, errors: {}
    });
  });

  router.post("/b/:name/questions", loadBoard, requireLogin, handle(async (req, res) => {
    const values = {
      title: String(req.body.title || "").trim(),
      body: String(req.body.body || "").trim()
    };
    const errors = {};
    if (!values.title || values.title.length > 150) {
      errors.title = "Question title must be between 1 and 150 characters.";
    }
    if (!values.body) errors.body = "Question body cannot be empty.";
    if (Object.keys(errors).length) {
      return res.status(400).render("boards/new-question", {
        board: req.board, values, errors
      });
    }
    const [result] = await getPool().execute(
      `INSERT INTO QA1_Questions (uid_user, room_id, board_id, title, body)
       VALUES (?, NULL, ?, ?, ?)`,
      [req.session.uid_user, req.board.board_id, values.title, values.body]
    );
    return res.redirect(`/questions/${result.insertId}`);
  }));

  router.get("/b/:name/edit", loadBoard, requireLogin, creatorOnly, (req, res) => {
    return res.render("boards/form", {
      mode: "edit", values: boardInput(req.board), errors: {}, board: req.board
    });
  });

  router.post("/b/:name/edit", loadBoard, requireLogin, creatorOnly, handle(async (req, res) => {
    const values = { ...boardInput(req.body), name: req.board.name };
    const result = validateBoardInput(values, { isEdit: true });
    if (!result.ok) {
      return res.status(400).render("boards/form", {
        mode: "edit", values, errors: result.errors, board: req.board
      });
    }
    const board = result.value;
    const [updated] = await getPool().execute(
      `UPDATE QA1_Boards SET title = ?, description = ?, rules = ?
       WHERE board_id = ? AND creator_id = ?`,
      [board.title, board.description, board.rules, req.board.board_id, req.session.uid_user]
    );
    if (!updated.affectedRows) return forbidden(res);
    return res.redirect(`/b/${req.board.name}`);
  }));

  router.get("/b/:name/delete", loadBoard, requireLogin, deleteAllowed, handle(async (req, res) => {
    return res.render("boards/delete", {
      board: req.board, question_count: await questionCount(req.board.board_id)
    });
  }));

  router.post("/b/:name/delete", loadBoard, requireLogin, deleteAllowed, handle(async (req, res) => {
    const [deleted] = await getPool().execute(
      "DELETE FROM QA1_Boards WHERE board_id = ? AND creator_id = ? AND name <> ?",
      [req.board.board_id, req.session.uid_user, "general"]
    );
    if (!deleted.affectedRows) return forbidden(res);
    return res.redirect("/boards");
  }));

  return router;
}

module.exports = createBoardRouter;