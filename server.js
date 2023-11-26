// 필요한 모듈 가져오기
const fs = require("fs");
const express = require("express");
// const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require('cors');
const app = express();
const port = process.env.PORT || 8080;
// const FileStore = require("session-file-store")(session);

// JSON 및 URL-encoded 데이터를 파싱하기 위한 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors({
  origin : '*',
}));

// JSON 파일에서 데이터베이스 구성 정보 읽고 파싱하기
const data = fs.readFileSync("./database.json");
const conf = JSON.parse(data);
const { Client } = require("pg");

// PostgreSQL 데이터베이스 연결 생성
const connection = new Client({
  host: conf.host,
  user: conf.user,
  password: conf.password,
  database: conf.database,
  port: conf.port,
});

// 세션 관련 옵션 및 모듈 가져오기
// const sessionOption = require("./lib/sessionOption");
// const PgSession = require("connect-pg-simple")(session);

// // 세션 저장을 위한 PostgreSQL 클라이언트 생성
// const sessionPool = new Client({
//   connectionString: sessionOption.connectionString,
// });

// // 세션 정보를 저장하기 위한 테이블 이름 설정
// const sessionStore = new PgSession({
//   pool: sessionPool,
//   tableName: "session",
// });

// // 세션 설정 및 미들웨어 설정
// app.use(
//   session({
//     name: "session ID",
//     key: "session_cookie_name",
//     secret: sessionOption.password,
//     store: new FileStore(),
//     resave: false,
//     saveUninitialized: false,
//     cookie:
//       ((maxAge = 24 * 60 * 60 * 1000), (httpOnly = false), (secure = false)),
//   })
// );

// 파일 업로드를 위한 Multer 모듈 설정
const multer = require("multer");
// const upload = multer({ dest: "./upload" });

// 데이터베이스 연결
connection.connect((err) => {
  if (err) console.log(err);
  else {
    console.log("데이터베이스 연결 성공");
  }
});

// 인증 확인을 위한 라우트 핸들러
app.get("/authcheck", (req, res) => {
  const sendData = { isLogin: "" };
  if (req.session.is_logined) {
    sendData.isLogin = "True";
  } else {
    sendData.isLogin = "False";
  }
  res.send(sendData);
});

// 로그아웃 라우트 핸들러
app.get("/logout", function (req, res) {
  // 세션 파기
  req.session.destroy(function (err) {
    res.status(200).send("성공적으로 로그아웃되었습니다.");
  });
});

// 로그인 라우트 핸들러
app.post("/login", (req, res) => {
  // 데이터를 받아서 결과를 전송
  const username = req.body.userId;
  const password = req.body.userPassword;
  const sendData = { isLogin: "" };

  if (username && password) {
    // 아이디와 비밀번호가 입력되었는지 확인
    connection.query(
      "SELECT * FROM userTable WHERE username = $1",
      [username],
      function (error, rows, fields) {
        if (error) throw error;
        if (rows.rows.length) {
          // 데이터베이스에서 반환된 결과가 있다면, 일치하는 아이디가 있다는 것

          bcrypt.compare(password, rows.rows[0].password, (err, result) => {
            // 입력된 비밀번호가 저장된 해시값과 일치하는지 확인
            if (result === true) {
              // 비밀번호가 일치하는 경우
              req.session.is_logined = true; // 세션 정보 업데이트
              req.session.nickname = username;
              req.session.save(function () {
                sendData.isLogin = "True";
                res.send(sendData);
              });
            } else {
              // 비밀번호가 일치하지 않는 경우
              sendData.isLogin = "로그인 정보가 일치하지 않습니다.";
              res.send(sendData);
            }
          });
        } else {
          // 데이터베이스에 해당 아이디가 없는 경우
          sendData.isLogin = "아이디 정보가 일치하지 않습니다.";
          res.send(sendData);
        }
      }
    );
  } else {
    // 아이디, 비밀번호 중 입력되지 않은 값이 있는 경우
    sendData.isLogin = "아이디와 비밀번호를 입력하세요!";
    res.send(sendData);
  }
});

// 회원가입 라우트 핸들러
app.post("/signin", (req, res) => {
  // 데이터를 받아서 결과를 전송
  const username = req.body.userId;
  const password = req.body.userPassword;
  const password2 = req.body.userPassword2;

  const sendData = { isSuccess: "" };

  if (username && password && password2) {
    let sql = "SELECT * FROM userTable WHERE username = $1";
    let params = [username];
    connection.query(sql, params, (err, rows, fields) => {
      if (
        (rows.rows.length == 0 ||
          (rows.rows.length == 1 && rows.rows[0].username != username)) &&
        password == password2
      ) {
        // 데이터베이스에 동일한 사용자 이름이 없고, 비밀번호가 올바르게 입력된 경우
        const hashedPassword = bcrypt.hashSync(password, 10); // 입력된 비밀번호를 해시화
        connection.query(
          "INSERT INTO userTable (username, password) VALUES($1,$2)",
          [username, hashedPassword],
          function (err, data) {
            if (err) throw error;
            req.session.save(function () {
              sendData.isSuccess = "True";
              res.send(sendData);
            });
          }
        );
      } else if (password != password2) {
        // 비밀번호가 올바르게 입력되지 않은 경우
        sendData.isSuccess = "입력된 비밀번호가 서로 다릅니다.";
        res.send(sendData);
      } else {
        // 데이터베이스에 동일한 사용자 이름이 이미 있는 경우
        sendData.isSuccess = "이미 존재하는 아이디입니다!";
        res.send(sendData);
      }
    });
  } else {
    // 아이디, 비밀번호 중 입력되지 않은 값이 있는 경우
    sendData.isSuccess = "아이디와 비밀번호를 입력하세요!";
    res.send(sendData);
  }
});

// 고객 정보 불러오기 라우트 핸들러
app.get("/api/customers", (req, res) => {
  connection.query(
    "SELECT * FROM CUSTOMER WHERE isDeleted = '0' ORDER BY ID",
    (err, result) => {
      if (err != null) {
        console.log("에러");
        res.sendStatus(500);
      } else {
        console.log("성공");
        res.send(result.rows);
      }
    }
  );
});

// 이미지 업로드를 위한 Multer 설정
// app.use("/image", express.static("./upload"));

// 고객 정보 추가 라우트 핸들러
// app.post("/api/customers", upload.single("image"), (req, res) => {
//   let sql =
//     "INSERT INTO CUSTOMER (image, name, birthday, gender, job, createdDate, isdeleted) VALUES ($1,$2,$3,$4,$5,now(), 0)";
//   let image = "http://localhost:3000/image/" + req.file.filename;
//   let name = req.body.userName;
//   let birthday = req.body.birthday;
//   let gender = req.body.gender;
//   let job = req.body.job;
//   console.log(image);
//   let params = [image, name, birthday, gender, job];
//   connection.query(sql, params, (err, rows, fields) => {
//     res.send(rows);
//     console.log(sql);
//     console.log(params);
//     console.log(err);
//   });
// });

// 고객 정보 삭제 라우트 핸들러
app.delete("/api/customers/:id", (req, res) => {
  let sql = "UPDATE CUSTOMER SET isDeleted = 1 WHERE id  = $1";
  let params = [req.params.id];
  connection.query(sql, params, (err, rows, fields) => {
    res.send(rows);
  });
});

// 서버가 지정된 포트에서 실행됨
app.listen(port, () => console.log("포트 " + port + "에서 실행 중"));

// 1. 배지 발행
// app.post("/badge", upload.single("image"), async (req, res) => {
//   try {
//     const image = req.file
//       ? "http://35.216.96.15/image/" + req.file.filename
//       : null;

//     const { badgeName, content, detailContent } = req.body;
    
//     // 현재 시간을 생성
//     const currentDatetime = new Date();
//     // 생성된 현재 시간을 원하는 형식으로 변환 (예: 'YYYY-MM-DD HH:mm:ss')
//     const formattedDatetime = currentDatetime.toISOString().slice(0, 19).replace("T", " ");

//     const result = await connection.query(
//       "INSERT INTO tblbadge (image, badgeName, content, detailContent, createDt) VALUES ($1, $2, $3, $4, $5) RETURNING *",
//       [image, badgeName, content, detailContent, formattedDatetime]
//     );
    
//     res.status(201).json(result.rows[0]);
//   } catch (error) {
//     console.error(error);
//     res.status(500).send("Internal Server Error");
//   }
// });

// 2. 배지 조회
app.get("/badge/:badgeId?", async (req, res) => {
  try {
    const badgeId = req.params.badgeId;

    if (badgeId) {
      // badgeId가 주어진 경우 해당 배지만 조회
      const result = await connection.query("SELECT * FROM tblbadge WHERE badgeId = $1", [badgeId]);

      if (result.rows.length === 0) {
        res.status(404).send("Badge not found");
      } else {
        res.json(result.rows[0]);
      }
    } else {
      // badgeId가 주어지지 않은 경우 전체 배지 목록 조회
      const result = await connection.query("SELECT * FROM tblbadge");

      if (result.rows.length === 0) {
        res.status(404).send("No badges found");
      } else {
        res.json(result.rows);
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// 3. 유저 조회
app.get("/user", async (req, res) => {
  try {
    const result = await connection.query("SELECT * FROM tbluser");

    if (result.rows.length === 0) {
      res.status(404).send("User not found");
    } else {
      res.json(result.rows);
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// 4. 배지 수여
app.post("/mybadge", async (req, res) => {
  try {
    const { badgeId, userId } = req.body;

    // 현재 시간을 생성
    const currentDatetime = new Date();
    // 생성된 현재 시간을 원하는 형식으로 변환 (예: 'YYYY-MM-DD HH:mm:ss')
    const formattedDatetime = currentDatetime.toISOString().slice(0, 19).replace("T", " ");

    // 해당 badgeId와 userId의 조합이 이미 존재하는지 확인
    const existingBadge = await connection.query(
      "SELECT * FROM tbluserBadge WHERE badgeId = $1 AND userId = $2",
      [badgeId, userId]
    );

    if (existingBadge.rows.length > 0) {
      // 이미 존재하는 경우 업데이트
      await connection.query(
        "UPDATE tbluserBadge SET createDt = $1 WHERE badgeId = $2 AND userId = $3",
        [formattedDatetime, badgeId, userId]
      );
    } else {
      // 존재하지 않는 경우 새로운 레코드 추가
      await connection.query(
        "INSERT INTO tbluserBadge (badgeId, userId, createDt) VALUES ($1, $2, $3)",
        [badgeId, userId, formattedDatetime]
      );
    }

    res.status(201).send("Badge awarded successfully");
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});

// 5. 수여 배지 조회
app.get("/mybadge/:userId?", async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      // If userId is not provided, retrieve all badges
      const allBadgesResult = await connection.query(
        "SELECT b.badgeId, b.image, b.badgeName, ub.createDt FROM tbluserBadge ub JOIN tblbadge b ON ub.badgeId = b.badgeId"
      );

      if (allBadgesResult.rows.length === 0) {
        res.status(404).send("No badges found");
      } else {
        res.json(allBadgesResult.rows);
      }
    } else {
      // If userId is provided, retrieve badges for the specific user
      const userBadgesResult = await connection.query(
        "SELECT b.badgeId, b.image, b.badgeName, ub.createDt FROM tbluserBadge ub JOIN tblbadge b ON ub.badgeId = b.badgeId WHERE ub.userId = $1",
        [userId]
      );

      if (userBadgesResult.rows.length === 0) {
        res.status(404).send("No badges awarded to the user");
      } else {
        res.json(userBadgesResult.rows);
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Internal Server Error");
  }
});