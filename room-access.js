const { getPool } = require("./db");

async function isMember(roomId, userId) {
  if (!roomId || !userId) return false;
  const [rows] = await getPool().execute(
    "SELECT 1 FROM QA1_RoomMembers WHERE room_id = ? AND uid_user = ? LIMIT 1",
    [roomId, userId]
  );
  return rows.length > 0;
}

async function accessibleQuestion(questionId, userId) {
  if (!questionId) return null;
  const [rows] = await getPool().execute(
    "SELECT question_id, uid_user, room_id FROM QA1_Questions WHERE question_id = ? LIMIT 1",
    [questionId]
  );
  const question = rows[0];
  if (!question || (question.room_id !== null && !await isMember(question.room_id, userId))) {
    return null;
  }
  return question;
}

async function accessibleAnswer(answerId, userId) {
  if (!answerId) return null;
  const [rows] = await getPool().execute(
    `SELECT a.answer_id, a.question_id, a.uid_user, q.room_id
     FROM QA1_Answers AS a
     JOIN QA1_Questions AS q ON q.question_id = a.question_id
     WHERE a.answer_id = ? LIMIT 1`,
    [answerId]
  );
  const answer = rows[0];
  if (!answer || (answer.room_id !== null && !await isMember(answer.room_id, userId))) {
    return null;
  }
  return answer;
}

module.exports = { isMember, accessibleQuestion, accessibleAnswer };