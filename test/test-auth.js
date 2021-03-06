/* global describe, it, before, after, beforeEach, afterEach */
"use strict";
const chai = require("chai");
const chaiHttp = require("chai-http");
const jwt = require("jsonwebtoken");

const { app, startServer, closeServer } = require("../app/server.js");
const { User } = require("../app/user.model.js");
const { JWT_SECRET, MONGO_TEST_URL } = require("../app/config.js");

const expect = chai.expect;

chai.use(chaiHttp);

describe("Auth endpoints", function() {
  const name = "John Doe";
  const username = "johndoe";
  const password = "password11";

  before(function() {
    return startServer(MONGO_TEST_URL);
  });

  after(function() {
    return closeServer();
  });

  beforeEach(function() {
    return User.hashPassword(password).then(password =>
      User.create({
        name,
        username,
        password
      })
    );
  });

  afterEach(function() {
    return User.remove({});
  });

  describe("/api/user/login", function() {
    it("Should reject requests with no credentials", function() {
      return chai
        .request(app)
        .post("/api/user/login")
        .send({})
        .then(response => {
          expect(response, "Request should not succeed");
          expect(response).to.have.status(400);
          expect(response.text).to.equal("Bad Request");
        })
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(400);
        });
    });
    it("Should reject requests with incorrect usernames", function() {
      return chai
        .request(app)
        .post("/api/user/login")
        .send({ username: "wrongUsername", password })
        .then(response => expect(response, "Request should not succeed"))
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(401);
        });
    });
    it("Should reject requests with incorrect passwords", function() {
      return chai
        .request(app)
        .post("/api/user/login")
        .send({ username, password: "wrongPassword" })
        .then(response => expect(response, "Request should not succeed"))
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(401);
        });
    });
    it("Should return a valid auth token", function() {
      return chai
        .request(app)
        .post("/api/user/login")
        .send({ username, password })
        .then(res => {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an("object");
          const token = res.body.authToken;
          expect(token).to.be.a("string");
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ["HS256"]
          });
          expect(payload.user).to.deep.include({
            _id: payload.user._id,
            name,
            username
          });
        });
    });
  });

  describe("/api/user/refresh", function() {
    it("Should reject requests with no credentials", function() {
      return chai
        .request(app)
        .post("/api/user/refresh")
        .then(response => expect(response, "Request should not succeed"))
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(401);
        });
    });
    it("Should reject requests with an invalid token", function() {
      const token = jwt.sign(
        {
          username
        },
        "wrongSecret",
        {
          algorithm: "HS256",
          expiresIn: "7d"
        }
      );

      return chai
        .request(app)
        .post("/api/user/refresh")
        .set("Authorization", `Bearer ${token}`)
        .then(response => expect(response, "Request should not succeed"))
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(401);
        });
    });
    it("Should reject requests with an expired token", function() {
      const token = jwt.sign(
        {
          user: {
            username
          },
          exp: Math.floor(Date.now() / 1000) - 30 // Expired ten seconds ago
        },
        JWT_SECRET,
        {
          algorithm: "HS256",
          subject: username
        }
      );

      return chai
        .request(app)
        .post("/api/user/refresh")
        .set("authorization", `Bearer ${token}`)
        .then(response => expect(response, "Request should not succeed"))
        .catch(err => {
          if (err instanceof chai.AssertionError) {
            throw err;
          }

          const res = err.response;
          expect(res).to.have.status(401);
        });
    });
    it("Should return a valid auth token with a newer expiry date", function() {
      const token = jwt.sign(
        {
          user: {
            username
          }
        },
        JWT_SECRET,
        {
          algorithm: "HS256",
          subject: username,
          expiresIn: "7d"
        }
      );
      const decoded = jwt.decode(token);

      return chai
        .request(app)
        .post("/api/user/refresh")
        .set("authorization", `Bearer ${token}`)
        .then(res => {
          expect(res).to.have.status(200);
          expect(res.body).to.be.an("object");
          const token = res.body.authToken;
          expect(token).to.be.a("string");
          const payload = jwt.verify(token, JWT_SECRET, {
            algorithm: ["HS256"]
          });
          expect(payload.user).to.deep.equal({
            username
          });
          expect(payload.exp).to.be.at.least(decoded.exp);
        });
    });
  });
});
