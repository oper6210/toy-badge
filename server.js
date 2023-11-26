// 필요한 모듈 가져오기
const fs = require("fs");
const express = require("express");
// const session = require("express-session");
const bodyParser = require("body-parser");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 8080;
// const FileStore = require("session-file-store")(session);

// JSON 및 URL-encoded 데이터를 파싱하기 위한 미들웨어 설정
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(
  cors({
    origin: "*",
  })
);

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

// 파일 업로드를 위한 Multer 모듈 설정
const multer = require("multer");
const multerGoogleStorage = require("multer-google-storage");

const { Storage } = require("@google-cloud/storage"); // Storage 클래스를 임포트
const storage = new Storage({
  projectId: "testtt-f922d",
  keyFilename: "./testtt-f922d-395ea43cf6f1.json",
});

const upload = multer({
  storage: multerGoogleStorage.storageEngine({
    bucket: "bagde_stg",
    projectId: "testtt-f922d",
    keyFilename: "./testtt-f922d-395ea43cf6f1.json",
    filename: (req, file, cb) => {
      cb(null, `quizimage/${Date.now()}_${file.originalname}`);
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// 데이터베이스 연결
connection.connect((err) => {
  if (err) console.log(err);
  else {
    console.log("데이터베이스 연결 성공");
  }
});

// 이미지 업로드를 위한 Multer 설정
// app.use("/image", express.static("./upload"));

// 서버가 지정된 포트에서 실행됨
app.listen(port, () => console.log("포트 " + port + "에서 실행 중"));

// 1. 배지 발행
app.post("/badge", upload.single("image"), async (req, res) => {
  try {
    const imageUrl = `https://storage.googleapis.com/bagde_stg/${req.file.filename}`;

    // Fetch the last badgeid
    const lastBadgeIdResult = await connection.query(
      "SELECT badgeid FROM tblbadge ORDER BY badgeid DESC LIMIT 1"
    );

    // Calculate the next badgeid
    const nextBadgeId = lastBadgeIdResult.rows.length > 0 ? lastBadgeIdResult.rows[0].badgeid + 1 : 1;

    // JSON 데이터 준비
    const jsonData = {
      description: req.body.content,
      imageurl: imageUrl,
      name: req.body.badgeName,
    };

    // Create jsonFilename using the calculated badgeid
    const jsonFilename = `${nextBadgeId}.json`;

    const bucketName = "bagde_stg";

    // 업로드할 JSON 파일의 전체 경로 (버킷 내부 경로 포함)
    const jsonFilePath = `json/${jsonFilename}`;

    // JSON 파일을 문자열로 변환
    const jsonString = JSON.stringify(jsonData);

    // 버킷 내 JSON 파일 업로드
    await storage.bucket(bucketName).file(jsonFilePath).save(jsonString, {
      contentType: "application/json",
    });

    const { badgeName, content, detailContent } = req.body;

    // 현재 시간을 생성
    const currentDatetime = new Date();
    // 생성된 현재 시간을 원하는 형식으로 변환 (예: 'YYYY-MM-DD HH:mm:ss')
    const formattedDatetime = currentDatetime
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

    const result = await connection.query(
      "INSERT INTO tblbadge (image, badgeName, content, detailContent, createDt) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      [imageUrl, badgeName, content, detailContent, formattedDatetime]
    );

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error(error);
    res.status(500).send(error);
  }
});

// 2. 배지 조회
app.get("/badge/:badgeId?", async (req, res) => {
  try {
    const badgeId = req.params.badgeId;

    if (badgeId) {
      // badgeId가 주어진 경우 해당 배지만 조회
      const result = await connection.query(
        "SELECT * FROM tblbadge WHERE badgeId = $1",
        [badgeId]
      );

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
    res.status(500).send(error);
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
    const formattedDatetime = currentDatetime
      .toISOString()
      .slice(0, 19)
      .replace("T", " ");

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
