const https = require("https");
const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const cors = require("cors");
const fs = require("fs");
var envpath = require("dotenv").config({ path: __dirname + "/./../../.env" });

var mysql = require("mysql");
var connection = mysql.createConnection({
  host: envpath.parsed.DB_HOST,
  user: envpath.parsed.DB_USERNAME,
  password: envpath.parsed.DB_PASSWORD,
  database: envpath.parsed.DB_DATABASE,
  port: envpath.parsed.DB_PORT,
});

connection.connect();

connection.query(
  'SELECT * from `settings` WHERE `key` = "SME_CHAT_SETTINGS" ',
  function (error, results, fields) {
    if (error) throw error;
    if (results && results.length > 0) {
      let settingsData = results[0];
      settingsData = JSON.parse(settingsData.config);

      console.log("The solution is: ", settingsData);

      const {
        addUser,
        removeUser,
        getUser,
        getUsersInRoom,
      } = require("./users");

      const router = require("./router");
      const { json } = require("body-parser");

      const app = express();

      let server = null;
      if (settingsData.sme_protocol == "http://") {
        server = http.createServer(app);
      } else {
        const options = {
          key: fs.readFileSync(settingsData.sme_path + "server.key"),
          cert: fs.readFileSync(settingsData.sme_path + "server.crt"),
        };
        server = https.createServer(options, app);
      }

      const io = socketio(server);

      app.use(cors());
      app.use(router);

      // io.on("connection", (socket) => {
      //   console.log(socket.id); // x8WIv7-mJelg7on_ALbx
      // });
      io.on("connect", (socket) => {
        socket.on("join", ({ name, userId, avatar }, callback) => {
          const { error, user } = addUser({
            id: socket.id,
            name,
            userId,
            avatar,
          });

          if (error) {
            const obj = {
              error,
              users: getUsersInRoom(),
            };
            return callback(obj);
          }

          socket.join(socket.id);

          // socket.emit('message', { user: 'admin', text: `${user.name}, welcome to room ${user.room}.`});
          // socket.broadcast.to(user.room).emit('message', { user: 'admin', text: `${user.name} has joined!` });
          const allUsers = getUsersInRoom();
          for (let index = 0; index < allUsers.length; index++) {
            const u = allUsers[index];
            if (u.id !== userId) {
              io.to(u.id).emit("roomData", { users: getUsersInRoom() });
            }
          }

          callback();
        });

        socket.on("sendMessage", (data, callback) => {
          let senderUser = getUser(data.senderChatID);
          const receiverUser = getUser(data.receiverChatID);
          console.log("receiverUser >>>", receiverUser);
          console.log("senderUser >>>", senderUser);
          console.log("rooms users", getUsersInRoom());

          if (!senderUser) {
            console.log("senderUser not found then join>>");
            senderUser = joinUser(
              socket.id,
              data.name,
              data.senderChatID,
              data.avatar
            );
          }

          if (senderUser) {
            io.to(senderUser.id).emit("message", {
              user: senderUser && senderUser.name ? senderUser.name : "",
              text: data.content,
              userId: data.senderChatID,
              senderChatID: data.senderChatID,
              receiverChatID: data.receiverChatID,
              users: getUsersInRoom(),
              createdDate: data.createdDate,
              isRead: true,
              avatar: senderUser ? senderUser.avatar : "",
            });
          }
          if (receiverUser) {
            io.to(receiverUser.id).emit("message", {
              user: senderUser && senderUser.name ? senderUser.name : "",
              text: data.content,
              userId: data.senderChatID,
              senderChatID: data.senderChatID,
              receiverChatID: data.receiverChatID,
              users: getUsersInRoom(),
              createdDate: data.createdDate,
              isRead: false,
              avatar: senderUser ? senderUser.avatar : "",
            });
          }

          callback();
        });

        socket.on("disconnect", () => {
          const user = removeUser(socket.id);
          const allUsers = getUsersInRoom();
          for (let index = 0; index < allUsers.length; index++) {
            const u = allUsers[index];
            io.to(u.id).emit("roomData", { users: getUsersInRoom() });
          }
          // if (user) {
          //   io.to(user.room).emit("message", {
          //     user: "Admin",
          //     text: `${user.name} has left.`,
          //   });
          //   io.to(user.room).emit("roomData", {
          //     room: user.room,
          //     users: getUsersInRoom(),
          //   });
          // }
        });
      });

      function joinUser(id, name, userId, avatar) {
        const { error, user } = addUser({ id, name, userId, avatar });
        const allUsers = getUsersInRoom();
        for (let index = 0; index < allUsers.length; index++) {
          const u = allUsers[index];
          if (u.id !== userId) {
            io.to(u.id).emit("roomData", { users: getUsersInRoom() });
          }
        }
        return user;
      }

      server.listen(settingsData.sme_port, () =>
        console.log(`Server has started at port:`, settingsData.sme_port)
      );
    }
  }
);

connection.end();
