const crypto = require("node:crypto");
const express = require("express");
const { getPool } = require("./db");
const { isMember } = require("./room-access");

const router = express.Router();
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const modes = ["hint", "explain", "full"];

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function code() {
  return Array.from({ length: 6 }, () => alphabet[crypto.randomInt(alphabet.length)]).join("");
}

function requireLogin(req, res, next) {
  if (!req.session.uid_user) return res.redirect("/login");
  next();
}

function notFound(res) {
  return res.status(404).render("error", {
    title: "Room not found",
    message: "That room is unavailable."
  });
}

function forbidden(res) {
  return res.status(403).render("error", {
    title: "Not allowed",
    message: "Only the room owner can do that."
  });
}

async function roomList(res, error = null, values = {}) {
  const [rooms] = await getPool().execute(
    `SELECT r.room_id, r.name, r.join_code, r.owner_id, r.created_at
     FROM QA1_Rooms AS r
     INNER JOIN QA1_RoomMembers AS m ON m.room_id = r.room_id
     WHERE m.uid_user = ?
     ORDER BY r.created_at DESC, r.room_id DESC`,
    [res.locals.currentUser.uid_user]
  );
  return res.status(error ? 400 : 200).render("rooms/index", { rooms, error, values });
}

async function roomForMember(req, res, next) {
  const roomId = parseId(req.params.id);
  if (!roomId || !await isMember(roomId, req.session.uid_user)) return notFound(res);
  const [rows] = await getPool().execute(
    "SELECT room_id, name, join_code, owner_id, ai_mode, ai_notes FROM QA1_Rooms WHERE room_id = ? LIMIT 1",
    [roomId]
  );
  if (!rows[0]) return notFound(res);
  req.room = rows[0];
  next();
}

function ownerOnly(req, res, next) {
  if (req.room.owner_id !== req.session.uid_user) return forbidden(res);
  next();
}

function failure(next) {
  return (error) => {
    console.error(`Room operation failed: ${error.code || "UNKNOWN_ERROR"}`);
    next(error);
  };
}

router.get("/", requireLogin, async (req, res, next) => {
  try { await roomList(res); } catch (error) { failure(next)(error); }
});

router.post("/", requireLogin, async (req, res, next) => {
  const name = String(req.body.name || "").trim();
  if (!name || name.length > 60) {
    try { return await roomList(res, "Room name must be between 1 and 60 characters.", { name }); }
    catch (error) { return failure(next)(error); }
  }

  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const connection = await getPool().getConnection();
      try {
        await connection.beginTransaction();
        const [result] = await connection.execute(
          "INSERT INTO QA1_Rooms (name, join_code, owner_id) VALUES (?, ?, ?)",
          [name, code(), req.session.uid_user]
        );
        await connection.execute(
          "INSERT INTO QA1_RoomMembers (room_id, uid_user) VALUES (?, ?)",
          [result.insertId, req.session.uid_user]
        );
        await connection.commit();
        return res.redirect(`/rooms/${result.insertId}`);
      } catch (error) {
        await connection.rollback();
        if (error.code !== "ER_DUP_ENTRY") throw error;
      } finally {
        connection.release();
      }
    }
    return res.status(503).render("error", {
      title: "Room unavailable",
      message: "Could not make a unique join code. Please try again."
    });
  } catch (error) { failure(next)(error); }
});

router.post("/join", requireLogin, async (req, res, next) => {
  const joinCode = String(req.body.join_code || "").trim().toUpperCase();
  try {
    if (!new RegExp(`^[${alphabet}]{6}$`).test(joinCode)) {
      return await roomList(res, "Enter a valid 6-character join code.", { join_code: joinCode });
    }
    const [rows] = await getPool().execute(
      "SELECT room_id FROM QA1_Rooms WHERE join_code = ? LIMIT 1",
      [joinCode]
    );
    if (!rows[0]) return await roomList(res, "No room found for that code.", { join_code: joinCode });
    try {
      await getPool().execute(
        "INSERT INTO QA1_RoomMembers (room_id, uid_user) VALUES (?, ?)",
        [rows[0].room_id, req.session.uid_user]
      );
    } catch (error) {
      if (error.code !== "ER_DUP_ENTRY") throw error;
    }
    res.redirect(`/rooms/${rows[0].room_id}`);
  } catch (error) { failure(next)(error); }
});

router.get("/:id", roomForMember, async (req, res, next) => {
  try {
    const [questions] = await getPool().execute(
      `SELECT q.question_id, q.title, q.body, q.created_at, u.uName, COUNT(a.answer_id) AS answer_count
       FROM QA1_Questions AS q
       JOIN QA1_Users AS u ON u.uid_user = q.uid_user
       LEFT JOIN QA1_Answers AS a ON a.question_id = q.question_id
       WHERE q.room_id = ?
       GROUP BY q.question_id, q.title, q.body, q.created_at, u.uName
       ORDER BY q.created_at DESC, q.question_id DESC`,
      [req.room.room_id]
    );
    const [members] = await getPool().execute(
      `SELECT u.uName FROM QA1_RoomMembers AS m
       JOIN QA1_Users AS u ON u.uid_user = m.uid_user
       WHERE m.room_id = ? ORDER BY m.joined_at ASC, u.uName ASC`,
      [req.room.room_id]
    );
    res.render("rooms/detail", { room: req.room, questions, members });
  } catch (error) { failure(next)(error); }
});

router.get("/:id/questions/new", roomForMember, (req, res) => {
  res.render("question-form", { mode: "new", values: {}, error: null, room: req.room });
});

router.post("/:id/questions", roomForMember, async (req, res, next) => {
  const values = {
    title: String(req.body.title || "").trim(),
    body: String(req.body.body || "").trim()
  };
  const error = !values.title || values.title.length > 150
    ? "Question title must be between 1 and 150 characters."
    : !values.body ? "Question body cannot be empty." : null;
  if (error) return res.status(400).render("question-form", { mode: "new", values, error, room: req.room });
  try {
    const [result] = await getPool().execute(
      "INSERT INTO QA1_Questions (uid_user, room_id, title, body) VALUES (?, ?, ?, ?)",
      [req.session.uid_user, req.room.room_id, values.title, values.body]
    );
    res.redirect(`/questions/${result.insertId}`);
  } catch (error) { failure(next)(error); }
});

router.get("/:id/settings", roomForMember, ownerOnly, (req, res) => {
  res.render("rooms/settings", { room: req.room, error: null });
});

router.post("/:id/settings", roomForMember, ownerOnly, async (req, res, next) => {
  const room = {
    ...req.room,
    name: String(req.body.name || "").trim(),
    ai_mode: String(req.body.ai_mode || ""),
    ai_notes: String(req.body.ai_notes || "").trim()
  };
  const error = !room.name || room.name.length > 60
    ? "Room name must be between 1 and 60 characters."
    : !modes.includes(room.ai_mode) ? "Choose a valid AI mode."
    : room.ai_notes.length > 500 ? "Notes must be 500 characters or fewer." : null;
  if (error) return res.status(400).render("rooms/settings", { room, error });
  try {
    await getPool().execute(
      "UPDATE QA1_Rooms SET name = ?, ai_mode = ?, ai_notes = ? WHERE room_id = ? AND owner_id = ?",
      [room.name, room.ai_mode, room.ai_notes || null, room.room_id, req.session.uid_user]
    );
    res.redirect(`/rooms/${room.room_id}`);
  } catch (error) { failure(next)(error); }
});

router.post("/:id/leave", roomForMember, (req, res, next) => {
  if (req.room.owner_id === req.session.uid_user) return forbidden(res);
  getPool().execute(
    "DELETE FROM QA1_RoomMembers WHERE room_id = ? AND uid_user = ?",
    [req.room.room_id, req.session.uid_user]
  ).then(() => res.redirect("/rooms")).catch(failure(next));
});

router.post("/:id/delete", roomForMember, ownerOnly, (req, res, next) => {
  getPool().execute(
    "DELETE FROM QA1_Rooms WHERE room_id = ? AND owner_id = ?",
    [req.room.room_id, req.session.uid_user]
  ).then(() => res.redirect("/rooms")).catch(failure(next));
});

module.exports = router;