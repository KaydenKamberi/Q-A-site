const express = require("express");
const path = require("path");
const { checkDatabaseConnection } = require("./db");

const app = express();
const port = Number(process.env.PORT || 5000);

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, "public")));

let databaseStatus = {
  ok: false,
  message: "Database check has not run yet."
};

app.get("/", (req, res) => {
  res.render("index", { databaseStatus });
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