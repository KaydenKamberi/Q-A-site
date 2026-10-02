// Renders every Boards Phase 1 view with empty and filled sample data.
// No database or server needed. Run from the repo root:
//
//   node views/boards/render-samples.js            check every view renders
//   node views/boards/render-samples.js out-dir    also write each page as HTML
//
// The pages link /styles.css and /css/boards.css, so open written files through
// the app's static server (or copy public/ next to them) to see them styled.
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const viewsDir = path.join(__dirname, "..");
const loggedIn = { uid_user: 1, uName: "kayden" };

// Routes pass `user`; the shared header reads `currentUser` from res.locals.
function locals(user, data) {
  return { user, currentUser: user, ...data };
}

const filledBoard = {
  name: "apeuro",
  title: "AP European History",
  description: "Questions about AP Euro units, DBQs, and LEQs.",
  rules_list: ["Be kind.", "Show what you've tried.", "Rule 3: no homework dumps <b>really</b>"],
  creator_uName: "kayden",
  created_at: new Date("2026-09-30T15:00:00Z")
};

const samples = {
  "index-empty": ["boards/index", locals(null, { boards: [] })],
  "index-filled": ["boards/index", locals(loggedIn, {
    boards: [
      { name: "general", title: "General", description: "Anything that doesn't fit elsewhere.", question_count: 42 },
      { name: "apeuro", title: "AP European History", description: null, question_count: 1 },
      { name: "calc_bc", title: "AP Calculus BC", description: "<script>alert(1)</script>", question_count: 0 }
    ]
  })],

  "form-create-empty": ["boards/form", locals(loggedIn, {
    mode: "create",
    values: { name: "", title: "", description: "", rules: "" },
    errors: {}
  })],
  "form-create-errors": ["boards/form", locals(loggedIn, {
    mode: "create",
    values: { name: "apeuro", title: "", description: "", rules: "" },
    errors: { name: "That board name is taken", title: "Title is required" }
  })],
  "form-edit": ["boards/form", locals(loggedIn, {
    mode: "edit",
    values: { title: "AP European History", description: "AP Euro help.", rules: "Be kind.\nShow your work." },
    errors: {},
    board: { name: "apeuro", title: "AP European History" }
  })],

  "show-empty": ["boards/show", locals(null, {
    board: { name: "apeuro", title: "AP European History", description: null, rules_list: [], creator_uName: "kayden", created_at: new Date() },
    questions: [],
    canEdit: false,
    canDelete: false
  })],
  "show-filled": ["boards/show", locals(loggedIn, {
    board: filledBoard,
    questions: [
      { question_id: 12, title: "How do I structure a DBQ thesis?", uName: "maria", created_at: new Date(), answer_count: 3 },
      { question_id: 9, title: "Causes of the Thirty Years' War", uName: "sam", created_at: new Date("2026-09-29T10:00:00Z"), answer_count: 1 }
    ],
    canEdit: true,
    canDelete: true
  })],

  "new-question-empty": ["boards/new-question", locals(loggedIn, {
    board: { name: "general", title: "General" },
    values: { title: "", body: "" },
    errors: {}
  })],
  "new-question-errors": ["boards/new-question", locals(loggedIn, {
    board: { name: "general", title: "General" },
    values: { title: "", body: "Some details" },
    errors: { title: "Title is required" }
  })],

  "delete-empty": ["boards/delete", locals(loggedIn, { board: { name: "apeuro", title: "AP European History" }, question_count: 0 })],
  "delete-filled": ["boards/delete", locals(loggedIn, { board: { name: "apeuro", title: "AP European History" }, question_count: 7 })]
};

const outDir = process.argv[2];
if (outDir) fs.mkdirSync(outDir, { recursive: true });

let failed = 0;
for (const [name, [view, data]] of Object.entries(samples)) {
  const file = path.join(viewsDir, `${view}.ejs`);
  try {
    const html = ejs.render(fs.readFileSync(file, "utf8"), data, { filename: file });
    if (outDir) fs.writeFileSync(path.join(outDir, `${name}.html`), html);
    console.log(`ok    ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`FAIL  ${name}\n${error.message}`);
  }
}

process.exitCode = failed ? 1 : 0;
