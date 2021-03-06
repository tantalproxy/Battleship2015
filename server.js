

var http = require('http');
var uuid = require('node-uuid');
var express = require("express");
var events = require("events").EventEmitter;
var bodyParser = require("body-parser");

var openShiftPort = process.env.OPENSHIFT_NODEJS_PORT;
var openShiftHost = process.env.OPENSHIFT_NODEJS_IP;
var PORT = openShiftPort || 8080;
var HOST = openShiftHost || 'localhost';

var app = express();
var server = http.Server(app);
server.listen(PORT, HOST);

var sio = require('socket.io');
var io = sio.listen(server);


var playRoom = require("./playroom").playRoom;
// var proc = require("./protocol");

app.use(bodyParser());
app.use(express.static(__dirname + '/static'));

app.get("/", function(req, res) {

	res.sendfile("room-select.html");
});

app.get("/end/:gameId", function(req, res) {
    var gameId = parseInt(req.params.gameId);
    var room = playRoom.getRoom(gameId);
    room.cleanRoom();

    io.sockets.emit('game' + gameId, {
        body: {
            type: 'end'
        }
    });

    res.redirect("/");
});

app.get('/rooms', function(req, res) {
	res.setHeader("Content-Type", "application/json");
	var rooms;
	rooms = playRoom.showAll();
	res.end(JSON.stringify(rooms));
})

app.get("/game/:gameId/:Uid", function(req, res) {
    var gameId = parseInt(req.params.gameId);
    var playerUid = req.params.Uid;
    console.dir(req.params);
    var room = playRoom.getRoom(gameId);
    console.log("gameInfo->" + gameId + "," + playerUid);
    var isInRoom = room.getPlayerByUid(playerUid);

    if (isInRoom && room.ready < room.getPlayerCount()) {
        room.ready++;
        res.sendfile("main.html");
    }
    else if (isInRoom && room.ready >= room.getPlayerCount()) {
        room.cleanRoom();
        res.redirect("/");
    } else {
	   res.end("Страница не доступна");
    }   
});

app.get("/player/:gameId", function(req, res) {
    var gameId = parseInt(req.params.gameId);
    var room = playRoom.getRoom(gameId);
    //берем id игрока из промежуточного буфера
    var info = room.handleObjects.pop();

    playRoom.setPlayerInfo(gameId, {
        playerUid: info['uid']
    });

    res.setHeader("Content-Type", "application/json");

    if (room.getPlayerCount() != 2) {
        res.end("Страница не доступна");
    } else {
        res.end(JSON.stringify({
            playerId: room.getPlayerCount() - 1,
            playerUid: info['uid']
        })) 
    }
});

app.get(".*", function() {
    res.end("Страница не доступна");
})

console.log("server is running on port" + PORT);

var playerIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
var freeIds = [];

function getPlayerId() {
	return freeIds.unshift();
}

function sendMessage(outMessage, isBroadcasting) {
	if (outMessage) {
    	if (!isBroadcasting) {
    		socket.emit("message", outMessage);
    	} else {
    		console.log("SEND EVERYONE!");
    		io.sockets.emit("message", outMessage);
    	}
    }
}

freeIds = [].concat(playerIds);

io.sockets.on('connection', function (socket) {
	var state, serverReseted = false;

    //генерируем уникальный номер для 1 факта подключения
    var playerUid = socket.__playerUid !=null ? socket.__playerUid : socket.__playerUid = uuid.v4();

    console.log("generate new playerId=" + playerUid);
    //в случае перезапуска сервера всем подключенным сокетам 
    //нужно разослать сообщение об истекшей сессии
    if (!serverReseted) {
        socket.emit("redirect");
        serverReseted = true;
    }

    var onGameMsgHandler = function(channel, message) {
        var data, roomObject, msgBody, sendToAll = false;

        console.log("GAME MESSAGE:");
        console.dir(message);

        data = message.body;
        roomObject = playRoom.getRoom(data.roomId);

        if (data.type === "game") {

            //поступило игровое сообщение
            if (data.subtype === "ready") {
                var playerReadyCount = roomObject.playerStatuses.filter(function(s) {
                    return s == true;
                }).length;

                console.log("PLAYERS READY=" + playerReadyCount);
                msgBody = {
                    body: {
                        type: 'game',
                        subtype: 'ready'
                    }
                };

                if (playerReadyCount != 1) {
                    msgBody.body.subtype = "ready";
                    var nStatuses = roomObject.playerStatuses.slice(0, 1);
                    nStatuses.push(true);
                    console.dir(roomObject.playerStatuses);
                    console.log(nStatuses);
                    roomObject.playerStatuses = nStatuses;
                    
                    console.log("SEND READY!");
                } else {
                    msgBody.body.subtype = "start";
                    msgBody.body.priority = (function() {
                        var priorities = [];
                        for (var i=0; i < 2; i++) {
                            priorities.push(Math.random() * 10);
                        }
                        return priorities.sort(function(x, y) {x <= y});
                    })();
                    sendToAll = true;
                    console.log("ALL PLAYERS READY->START");
                }
                console.log("->ROOM=" + data.roomId);
                console.dir(msgBody);

                //посылаем всем
                if (sendToAll) {
                    io.sockets.emit("game" + data.roomId, msgBody);
                } else {
                //посылаем всем кроме себя
                    socket.broadcast.emit("game" + data.roomId, msgBody);
                }

            } else if (typeof(data.subtype) == "object" && data.subtype.result) {
                //пересылка сообщения от игрока при совершении действия
                var gameData = {
                    result: data.subtype.result,
                    x: data.subtype.x,
                    y: data.subtype.y,
                    destroyed: data.subtype.destroyed
                };
                var outmsg =  {
                    body: {
                        type: 'game',
                        subtype: 'action',
                        data: gameData
                    }
                };
                socket.broadcast.emit("game" + data.roomId, outmsg);
                console.log("SEND ACTION!");
                console.dir(outmsg);
            } else {
                var gameData = {
                    x: data.subtype.position.x,
                    y: data.subtype.position.y,
                    //весь набор координат кораблей для оценки игровой ситуации
                    playerData: data.subtype.playerData
                };
                var outmsg =  {
                    body: {
                        type: 'game',
                        subtype: 'request',
                        data: gameData
                    }
                };
                socket.broadcast.emit("game" + data.roomId, outmsg);
                console.log("SEND REQUEST!");
                console.dir(outmsg);
            }
        } 
    };

    socket.on('message', function(channel, message, callback) {
    	var data, outMessage, room, isBroadcasting;

        console.log("NEW MESSAGE:");
        console.dir(message);

    	if (!message) return;

        data = message.body;
        
        if (typeof(message) == "object" && data.type === "preconnect") {
			room = playRoom.getRoom(data.roomId)

        	room.addPlayer(socket);
        	outMessage = {body: {type: "waiting"}};

            uid = uuid.v4();
            room.playerUids.push(uid);

        	if (room.isFull()) {
        		if (playRoom.startGame(room)) {
        			outMessage.body.type = "start";
                    outMessage.body.uuid = uid;
        			outMessage.body.gameId = room.idx;
        			outMessage.body.channelKey = 9990 + room.idx;
                    
        			isBroadcasting = true;
        			state = "started";
        			process.nextTick((function(msg, broadcast) {
        				return function() {
        					sendMessage(msg, broadcast)
        				}
        			})(outMessage, isBroadcasting));
        			console.log("start GAME!!!");
        		}
        	} else {
        		outMessage.body.type = "renew";
                outMessage.body.uuid = uid;
        		state = "waiting";
        		isBroadcasting = true;
        		process.nextTick((function(msg, broadcast) {
        			return function() {
        				sendMessage(msg, broadcast)
        			}
        		})(outMessage, isBroadcasting));

        		console.log("BROADCAST MSG=" + outMessage);
        	}

            room.handleObjects.push({
                uid: playerUid,
                socket: socket
            });

        } 
        else if (typeof(message) == "object" && data.type == "game") {
            if (!playRoom.checkUid(data.uuid)) {
                console.log("Error: failed to identify by uuid!");
                return;
            }
            onGameMsgHandler.apply(null, arguments);
        }
        
    });
    //игрок вошел в игру
    socket.on("enter", function(inboxMsg, cb) {
        var body = inboxMsg.body;
        console.log("Player Enter the Game!");
        console.log("replace uid=" + body.playerUid);
        console.dir(body);
        //заменяем id игроков 
        playerUid = body.playerUid;
        //FIXME - почем-то при вызове получается зависание браузера
        if (cb) {
            console.log(playerUid);
            cb(true);
            console.log("AFTER CALLBACK");
        }
    });

    // Unsubscribe after a disconnect event
    socket.on('disconnect', function () {

        var rooms = playRoom.getRooms();
        var room, roomInfo;
        for (var i=0; i < rooms.length; i++) {
            room = rooms[i];
            roomInfo = room.playersInfo;
            if (roomInfo.length) {
                roomInfo.forEach(function(playerInfo) {
                    console.log("check for disconnect!");
                    console.dir(playerInfo);
                    if (playerUid == playerInfo['playerUid']) {
                        console.log("Player leave game->cleaning");
                        room.cleanRoom();
                        io.sockets.emit('game' + i, {
                            body: {
                                type: 'end',
                                result: 'disconnect',
                                resultMsg: 'Игрок отсоединился'
                            }
                        });
                    }
                })
            }
        }

    });
    console.log("connection estabilished!");
});
