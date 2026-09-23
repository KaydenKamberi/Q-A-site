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
  res.render("index", { databaseStatus });
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