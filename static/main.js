
(function($, global) {

	var ns = global.MarineBattle = global.MarineBattle || {};

	ns.Game = {
		players: 0,
		hits: 0,
		miss: 0,
		started: null,
		finished: null
	};

	var game;

	ns.CGame = function(playersCount, state, playerUid) {
		//конструктор новой игры
		var startTime, field, breakpoints = [];

		this.players = playersCount;
		this.playerUid = playerUid;
		startTime = new Date();
		this.started = startTime;

		//сокращение для 3 строчек
		(this.gameMap = new MarineMap(10, 10, state)).init();

		// gameMap = new MarineMap(10, 10, state);
		// this.gameMap = gameMap;
		// gameMap.init();

		//статистика
		this.hits = 0;
		this.miss = 0;

		this.isReady = function() {
			//определяем соблюдены ли условия для начала игры
			var notReady;

			notReady = mappedResources.filter(function(resource) {
				return !resource.positionReady;
			});

			if (notReady.length > 0) {
				alert("Вы не разместили все корабли!");
				return false;
			}

			return true;
		}

		this.checkEndCondition = function() {
			//проверка условий выйгрыша
			var totalHitsToWin = 0;
			mappedResources.forEach(function(res) {
				totalHitsToWin += res.orientation == "H" ? res.width : res.height; 
			});

			if (breakpoints === totalHitsToWin) {
				alert("Вы победили!");
				this.finished = new Date();
				return true;
			}
		}

		this.addCheckpoint = function() {
			breakpoints++;
		}
	}

	ns.CGame.prototype = ns.Game;

	//игровое состояние
	ns.GameState = function(plCount, socket) {
		var me = this, stageCounter, _lock = false, breakpoints = [];

		var gameStages = ['new', 'plan', 'start', 'roll', 'fight', 'end'];
		//dynamicLock - хранилище для блокировке для ожидания хода игрока
		var lockQueue, dynamicLock;

		lockQueue = [].concat(gameStages);
		this.resources = [];

		this.players = [1, 2];

		var log = $("#log");

		this.log = function(txt) {log.html(log.html() + "</br>" + txt)};
		//делаем активным первого игрока для теста
		this.activePlayer = this.players[0];

		this.nextStage = function(v) {
			var r = lockQueue[0];
			if (v != null) {
				r = r == v;
			}
			return r;
		}
		this.pushStage = function(stage) {
			return lockQueue.shift(stage);
		}
		this.popStage = function(v) {
			var l = lockQueue
			if (v != null) {
				lockQueue = l.slice(0, l.indexOf(v)).concat(
							l.slice(l.indexOf(v) + 1, l.length));
			} else {
				lockQueue = l.slice(1, l.length);
			}
			this.log("next stage->" + lockQueue[0] + "\r\n");
			this.log("log  stage->" + JSON.stringify(lockQueue) + "\r\n");
			return lockQueue
		}

		this.addGameEvent = function(eventName, cellObject) {
			var domTarget;

			var isHit = function(x, y) {
				return function(cell) {
					//TODO - здесь strict вариант
					return cell.data("x") == x && cell.data("y") == y
				}
			}
			var findDOMHelper = function(predicate) {
				var matches = [];
				$(".player2").find(".field").each(function() {
					if (predicate($(this))) {
						matches.push($(this));
					}
				})
				return matches;
			}

			//если передали объект то находим DOM элемент по его описанию
			if (cellObject.x != null && cellObject.y != null) {
				domTarget = findDOMHelper(isHit(cellObject.x, cellObject.y))[0];
			} else {
				domTarget = $(cellObject);
			}

			if (eventName === "miss") {

				if (domTarget.data("miss")) {
					alert("Выберите другую точку!");
				} else {
					domTarget.data("miss", true);
					domTarget.addClass("miss");

					// game.saveState("miss");
				}

			} 
			else if (eventName === "hit") {
				if (domTarget.data("hit")) {
					alert("Выберите другую точку!");
				} else {
					domTarget.data("hit", true);
					domTarget.addClass("hit");

					game.addCheckpoint();
					if (game.checkEndCondition()) {
						window.location = "/end/" + me.getChannelId();
					}
					// game.saveState("hit");
				}
			}
		}

		var acquire = function(target, opponentInfo) {
			//@opponentInfo - данные по кораблям оппонента

			var gameTargets, matchResources = [], $target;
				
			$target = $(target);
			var posX = $target.data("x");
			var posY = $target.data("y");
				
			gameTargets = mappedResources;//me.getOpponentResources(opponentInfo);

			gameTargets.forEach(function(obj) {

				if (posX >= obj.positionX && posY >= obj.positionY &&
					posX <= obj.positionX + (obj.orientation == "H" ? obj.width: 1) - 1 &&
					posY <= obj.positionY + (obj.orientation == "H" ? 1: obj.height) - 1)
				{
					matchResources.push(obj);
				}
			});

			//промах
			if (matchResources.length == 0) {
				me.log("result->"+"miss");
				me.communicate({
					result: 'miss',
					x: posX,
					y: posY
				});

				$target.css('backgroundColor', 'blue');
			//попадание
			} else {
				me.log("result->"+"hit");
				me.communicate({
					result: 'hit',
					x: posX,
					y: posY
				});

				$target.css('backgroundColor', 'red');

				$(".ui-draggable").each(function() {
					var t = $(this);
					if (t.offset().top == $target.offset().top && 
						t.offset().left == $target.offset().left) {

						t.css('display', 'none');
					}
				});
			}
		}

		this.getChannelId = function () {
			//достаем номер канала для рассылки сообщений
			//FIXME - придумать что-нибудь получше
			return window.location.pathname.split("/").slice(-2);
		}
		this.setPlayerId = function(v) {
			this.playerId = v;
		}
		this.getPlayerId = function() {
			return this.playerId;
		}

		var createMask = function() {
			var mask;
			var blockTarget = game.gameMap.map2;

			mask = $("#mask");
			if (!mask.length) {
				mask = $("<div id='mask'></div>").appendTo(blockTarget);
				mask.css({
					position: 'absolute',
					left: 0,
					right: 0,
					top: 0,
					bottom: 0
				});
			}
			return mask;
		}

		this.uiLock = function(v) {
			var msk;

			if (v != null) {_lock = v; console.log("SET LOCK="+ v);}
			
			msk = createMask();
			if (v === true) {
				msk.css("display", 'block');
			} else if (v === false) {
				msk.css("display", 'none');
			}
			
			return _lock;
		}
		this.bLock = function(v) {
			if (v != null) {dynamicLock = v; console.log("SET LOCK="+ v);}
			return dynamicLock;
		}
		var unlock_ = function() {
			me.uiLock(false);
		}

		//подписываемся на канал событий
		socket.on('game' + this.getChannelId(), function(msg) {
			console.log("GAME MSG->");
			console.dir(msg);
			var data = msg.body;
			//TODO - валидация формата сообщения
			if (data.subtype && data.subtype == "ready") {

				if (me.nextStage("start")) {
					alert("!!START THE GAME!!");
					me.popStage();
					unlock_();
				} else {				//оппонент готов
					alert("--OPP READY. WAIT YOU!--");
				}

			} else if (data.subtype && data.subtype == "start") {
				if (me.nextStage("start")) {
					var plId;
					alert("!!START THE GAME!!");
					me.popStage();
					game.gameMap.memorizeResourse(me);
					plId = me.getPlayerId();

					if (!plId) {
						throw new Error("State Error - player Id dont retrivied!");
					}

					//если игрок выиграл кость то он начинает игру
					if (plId && data.priority[me.getPlayerId()]) {
						unlock_();
					}

				} else {
					alert("--ERROR--");
				}
			} else if (data.subtype && data.subtype == "request") {
				//запрос на выполнение действия от другого игрока
				var gameData = data.data;
				var fields = $(".player1").find(".field"), x, y;

				fields.each(function() {
					var t = $(this);
					x = t.data("x");
					y = t.data("y");
					//пришло сообщение об атаке
					if (x == gameData.x && y == gameData.y) {
						me.log("request->" + x + ", " + y);
						acquire(t, gameData.playerData);
					}
				});

				me.bLock(false);
				me.uiLock(false);

			} else if (data.subtype && data.subtype == "action") {
				var gameData = data.data;
				//обработка ответа после выполнения действия
				//результат действия пользователя
				//помечаем корабль (поле) как поврежденный или промах
				me.addGameEvent(gameData.result, {x: gameData.x, y: gameData.y});
				me.log("action->" + data.result);

			} else if (data.type && data.type == "end") {
				alert("Вы проиграли игру(!");
				window.location = "/end/" + me.getChannelId();
			}
		});

		this.communicate = function(msg) {

			var channelId = me.getChannelId();
			socket.send("message", {
				body: {
					type   : 'game',
					subtype: msg,
					roomId : this.getChannelId()
				}
			});
		}

		this.open = function(playerUid) {
			game = new ns.CGame(2, this, playerUid);
		}

		//функция для тестирования
		this.getOpponentResources = function(r) {
			//тестовый образец
			var resources = r || [
				new SingleShip(null, 2, 1, 2),
				new SingleShip(null, 2, 6, 2),
				new DoubleShip(null, 3, 1, 4),
				new TripleShip(null, 1, 1, 6),
				new TripleShip(null, 1, 6, 6),
				new QuadShip(null, 1, 3, 8)
			];
			var objs = [];

			//для тестирования в локальном режиме
			for (var i=0; i < resources.length; i++) {
				for (var j=0; j < resources[i].pool.length; j++) {
					objs.push({
						x: resources[i].pool[j].startX,
						y: resources[i].pool[j].startY,
						width: resources[i].pool[j].width,
						height: resources[i].pool[j].width,
						orientation: resources[i].orientation
					})
				}
			}

			return objs;
		}

		this.nextTurn = function() {
			this.currentState++;
			//определяем нового активного игрока
			// this.activePlayer = this.players[this.currentState % this.playerCount];
			this.currentResources = this.getResources();

			//здесь должна быть блокирующая функция ожидания хода

		};

		this.stateSave = function(eventName) {
			if (eventName == "miss") {
				this.miss++;
			} else if (eventName == "hit") {
				this.hits++;
			}
		}
	}

	ns.Map = {
		width: 10,
		height: 10,
		fieldWidth: "40px",
		fieldHeight: "40px"
	}

	var mappedResources = [];
	var selection = null;

	var MarineMap = function(width, height, state) {

		var gameState, step, me = this;
		gameState = state;
		this.state = gameState;

		this.cwidth = width || this.width;
		this.cheight = height || this.height;

		var gameContainer = $(".container");

		this.createFields = function(gameMap) {
			var field, label, i, j, map,
				fieldLeft, fieldTop, labelLeft, labelTop;

			var mapLeft = gameMap.offset().left;
			var mapTop = gameMap.offset().top;

			var alfaLabels = ['A', 'B', 'C', 'D', 'E', 'F', 'I', 'H', 'J', 'G'];

			for (i = 0; i < this.cwidth; i++) {
				for (j = 0; j < this.cheight; j++) {
					field = $('<div></div>').appendTo(gameMap);
					fieldLeft = i * parseInt(ns.Map.fieldWidth);
					fieldTop = j * parseInt(ns.Map.fieldHeight);

					cssStyle = {
						// "float" : "left",
						"position": "absolute",
						"left"  : fieldLeft,
						"top"	: fieldTop,
						"width" : this.fieldWidth,
						"height": this.fieldHeight
					}
					field.addClass("field");
					field.css(cssStyle);

					field.data("x", i);
					field.data("y", j);

					if (i === 0) {
						labelLeft = fieldLeft - parseInt(ns.Map.fieldWidth);
						label = $('<div></div>').appendTo(gameMap);
						label.addClass("label");
						label.html((j+1).toString());
						label.css(cssStyle).css("left", labelLeft);
					}

					if (j === 0) {
						labelTop = fieldTop - parseInt(ns.Map.fieldHeight);
						label = $('<div></div>').appendTo(gameMap);
						label.html((alfaLabels[i]).toString());
						label.addClass("label");
						label.css(cssStyle).css("top", labelTop);
					}

				}
			}
		};

		this.createResources = function(resources, update) {
			//@resources - массив с кораблями (ресурсами)
			var resourcesCounter = 0;
			this.resources = resources;

			if (update) {
				var fields = $('.field');
				fields.css('backgroundColor', 'white');
			}

			this.resources.forEach(function(res) {
				res.pool.forEach(function(obj) {
					obj.idx = resourcesCounter;
					resourcesCounter++;
					obj.draw();
				});
			}, this);
		};

		this.createGameMap = function(mapContainer, playerId) {
			//создаем поле игрока

			var map_ = $("<div></div>").appendTo(mapContainer);

			this.myField = map_;

			map_.addClass("map");

			map_.css("width", (this.width * parseInt(this.fieldWidth)).toString())
				.css("height", (this.height * parseInt(this.fieldHeight)).toString())
				.data("player", playerId);

			return map_;
		};

		this.compactMapData = function() {
			//получаем компактное представление игрововых элементов
			var components = [];
			return mappedResources.map(function(it) {return it.toJson();})
		}

		this.setFieldEvents = function(eventBus) {
			var me = this;

			var onFieldClick = function(target) {
				var nextStage = state.nextStage;
				if (state.bLock()) {
					console.log("illegal action! opponent is waiting!");
					return;
				}
				if (nextStage("fight")) {
					//посылаем сообщение оппоненту
					state.uiLock(true);
					state.bLock(true);
					eventBus.communicate({
						position: {	
							x: $(target).data("x"),
							y: $(target).data("y")
						},
						playerData: me.compactMapData()
					});
				} else if (nextStage("start")) {
					alert("Opponent is not ready!");
				} else {
					alert("Unknown error!");
				}

			}

			//атаки кораблей противника
			this.map2.find(".field").on('click', function(event) {
				//проверяем активного игрока и совершаем запрошенное действие
				if (gameState.started && !gameState.frozen) {
					onFieldClick(event.target);
				}
			});

		}

		this.memorizeResourse = function(state) {
			//фиксация раставленных кораблей (их координат)

			state.objects = [];

			mappedResources.forEach(function(obj) {
				this.objects.push(obj);
			}, state);

			state.started = true;

			this.setFieldEvents(state);

		};

		this.createUI = function() {

			var controls, wraps, map1, map2;
			var container = $(".container");
			//создаем поле первого игрока
			var mapPlayer1 = this.createGameMap(gameContainer, 1).css({
				'position': 'absolute',
				// 'left': 100,
				// 'top': 200,
				'top': container.offset().top,
				'left': container.offset().left,
				'display': 'block'
			})
			this.map1 = mapPlayer1;
			mapPlayer1.addClass("player1");
			//создаем поле второго игрока
			var mapPlayer2 = this.createGameMap(gameContainer, 2).css({
				'position': 'absolute',
				// 'left': 500 + parseInt(ns.Map.fieldWidth) * 2,
				// 'top': 200,
				'top': container.offset().top,
				'left': container.offset().left + parseInt(container.css("width")) - parseInt(mapPlayer1.css('width')),
				'display': 'block'
			});
			mapPlayer2.addClass("player2");
			this.map2 = mapPlayer2;
			this.createFields(mapPlayer1);
			this.createFields(mapPlayer2);

			controls = $("<div></div>").appendTo(gameContainer);
			controls.addClass("controls");
			//кнопка подготовки к игре
			var prepareButton = $("<button></button>").appendTo(controls);
			prepareButton.addClass('prepare_button');
			prepareButton.html("New game");

			//размещаем группы кораблей 
			prepareButton.on('click', function(event) {

				if (state.nextStage("new")) {
					state.popStage();
					me.createResources([
						new SingleShip(mapPlayer1, 2, 1, 2),
						// new SingleShip(mapPlayer1, 2, 1, 2),
						// new SingleShip(mapPlayer1, 2, 6, 2),
						// new DoubleShip(mapPlayer1, 3, 1, 4),
						// new TripleShip(mapPlayer1, 1, 1, 6),
						// new TripleShip(mapPlayer1, 1, 6, 6),
						// new QuadShip(mapPlayer1, 1, 3, 8)
					]);
				}
			});
			//кнопка начала игры
			var startButton = $("<button></button>").appendTo(controls);
			startButton.addClass('start_button');
			startButton.html("Ready");

 			startButton.on('click', function(event) {
 				var nextStage = gameState.nextStage;

 				if (!nextStage("plan")) {
 					return;
 				}

 				if (game.isReady()) {
 					gameState.popStage();
 				}
 				var checkStage = function() {
 					switch (nextStage()) {
	 					case "fight":
	 						//сразу начинаем игру
	 						state.uiLock(false);
	 						state.bLock(true);
	 						gameState.log("start the game!");
	 						break;
	 					case "start":
	 						//ждем оппонента 
	 						state.uiLock(true);
							gameState.communicate("ready");
							gameState.log("wait for opp!");
	 				}
 				}
 				checkStage();
 				//блокируем кнопку
				$(event.target).css('disabled', "true");
 				
			});

			// var firstButton = $("<button></button>").appendTo(controls);
			// firstButton.click(function() {
			// 	if (gameState.nextStage("fight")) {
			// 		state.bLock(false);
			// 		console.log("You turn first!");
			// 	}
			// });
			//кнопка поворота корабля на этапе размещения
			// var rotateButton = $("<button></button>").appendTo(controls);
			// rotateButton.addClass('rotate_button');
			// rotateButton.html("Rotate");

			//создание лога действий
			var logView = $("<div></div>").appendTo(wraps);
			logView.addClass("log_view");
		};

		this.init = function() {
			this.createUI();
		};

	}

	MarineMap.prototype = ns.Map;

	ns.Resource = {
		user: null,
		components: null
	}

	//фабрика игровых объектов
	ns.FieldComponent = {
		width: 0,	//единица измерения - 1 клеточка поля
		height: 0,  //единица измерения - 1 клеточка поля
		container: null, //Jquery компоненты-представление корабля на поле
		childBlocks: null,
		DOMhelper: null,
		inOwnContainer: false, //означает что элемент перенесен в нужный контейнер
		getWidth: function() {
			var measure;
			if (this.orientation == "H") {
				measure = this.width;
			} else {
				measure = this.height;
			}
			return measure * parseInt(ns.Map.fieldWidth)
		},
		getHeight: function() {
			var measure;
			if (this.orientation == "H") {
				measure = this.height;
			} else {
				measure = this.width;
			}
			return measure * parseInt(ns.Map.fieldHeight)
		},
		rotateCW: function(pointX, pointY) {

			var newPosition, segmentNumber, drawStartX, drawStartY; 
			var rotatePoint = {};
			var parent = this.DOMhelper.parent();
			var segmentWidth = parseInt(ns.Map.fieldWidth);
			var orient = "H";

			globalX = $(".player1").position().left;
			globalY = $(".player1").position().top;

			if (this.width == 1 && this.height == 1) {return;}
			segmentNumber = Math.floor(
				Math.abs(this.leftPosition - pointX) / segmentWidth);

			rotatePoint.x = this.leftPosition + segmentNumber * segmentWidth;
			rotatePoint.y = this.topPosition + segmentNumber * segmentWidth;

			drawStartX = this.leftPosition;
			drawStartY = this.topPosition;
			drawStartXSeg = (drawStartX - globalX) / segmentWidth;
			drawStartYSeg = (drawStartY - globalY) / segmentWidth;

			this.orientation = this.orientation == "H" ? "V" : "H";
			if (this.inOwnContainer && !this.detectCollision(drawStartX, drawStartY)) {
				this.DOMhelper.remove();
				orient = this.orientation;

				this.draw(drawStartXSeg, drawStartYSeg, orient, "player1");
				this.positionX = drawStartXSeg;
				this.positionY = drawStartYSeg;
			} else {
				this.orientation = this.orientation == "H" ? "V" : "H";
			}
		},
		draw: function(startX, startY, orientation, playerField) {
			var fields, containers, me = this;	

			me.positionX = startX || this.startX;
			me.positionY = startY || this.startY;

			orientation = orientation || "H";
			me.orientation = orientation;

			this.childBlocks = [];
			var div = $(document.createElement("div"));
			var map_ = $(".player2");
			var myMap = $(".player1");

			var mapLeft = parseInt(map_.position().left);
			var mapTop = parseInt(map_.position().top);

			div.appendTo((playerField && $("." + playerField)) || map_);

			var fieldWidth = parseInt(ns.Map.fieldWidth);
			var fieldHeight = parseInt(ns.Map.fieldHeight);

			div.css({
				"position": "absolute",
				"left": (me.positionX * fieldWidth).toString() + "px",
				"top": (me.positionY * fieldHeight).toString() + "px",
				"width": orientation == "H"? me.width * fieldWidth : me.height * fieldHeight,
				"height": orientation == "H"? me.height * fieldHeight : me.width * fieldWidth,
				// "border": "4px solid purple",
				"backgroundColor": "green"
			});

			this.childBlocks.push(div);
			this.DOMhelper = div;
			var previousGeometry = {};

			this.detectCollision = function(leftPosition, topPosition) {
				var rightC, leftC, topC, bottomC;

				currMap = $(".player1");
				mapLeft = currMap.position().left;
				mapTop = currMap.position().top;

				leftPosition = leftPosition || this.leftPosition;
				rightPosition = leftPosition + Number(this.getWidth());
				topPosition = topPosition || this.topPosition;
				bottomPosition = topPosition + Number(this.getHeight());

				// console.log("self->");
				// console.log(this.idx + "->posX:" + leftPosition);
				// console.log(this.idx + "->posY:" + topPosition);
				var detected = false;

				mappedResources.forEach(function(resource) {

					var rightEdge = Number(resource.leftPosition) + Number(resource.getWidth()) + parseInt(ns.Map.fieldWidth);
					var bottomEdge = Number(resource.topPosition) + Number(resource.getHeight()) + parseInt(ns.Map.fieldHeight);

					rightC = Number(leftPosition) < rightEdge;
					bottomC = Number(topPosition) < bottomEdge;

					leftC = (Number(leftPosition) + Number(this.getWidth())) >
					    	 Number(resource.leftPosition) - parseInt(ns.Map.fieldWidth);

					topC = (Number(topPosition) + Number(this.getHeight())) > 
					   		Number(resource.topPosition) - parseInt(ns.Map.fieldHeight);
					
					// if (rightC) console.log("RIGHT EDGE COLLISION->" + rightC + "," + rightEdge);
					// if (bottomC) console.log("BOTTOM EDGE COLLISION->" + bottomC + "," + bottomEdge);
					// if (leftC) console.log("LEFT EDGE COLLISION->" + leftC + "," + Number(resource.leftPosition));
					// if (topC) console.log("TOP EDGE COLLISION->" + topC + "," + Number(resource.topPosition));

					if (this.idx != resource.idx &&
					   ((rightC && bottomC) && (leftC && topC))) {
						detected = true;
					}

				}, this);
				
				
				//выход за границы
				if (leftPosition < mapLeft || topPosition < mapTop ||
					rightPosition > (mapLeft + currMap.width()) ||
					bottomPosition > (mapTop + currMap.height())
				) {
					detected = true;
				}

				return detected;
			};

			div.draggable({
				"appendTo": "body",
				start: function(e, ui) {
					//сохраняем стартовые позиции элемента перед захватом
					//для того чтобы вернуть его назад в случае неверного "падения"
					previousGeometry.left = ui.helper.position().left;
					previousGeometry.top = ui.helper.position().top;

					$("#positionLog .startX").html(previousGeometry.left);
					$("#positionLog .startY").html(previousGeometry.top);
				},
				drag: (function(item) {
					return function(e, ui) {
						var pX, pY, leftEdge, topEdge,
							parent, currentXOffset, currentYOffset,
							relPX, relPY;

						leftEdge = myMap.position().left + myMap.width();
						topEdge = myMap.position().top + myMap.height();

						parent = ui.helper.parent();
						currentXOffset = parent.position().left;
						currentYOffset = parent.position().top;
						relPX = ui.position.left;
						relPY = ui.position.top;
						pX = currentXOffset + ui.position.left;
						pY = currentYOffset + ui.position.top;

						$("#positionLog .curX").html(pX);
						$("#positionLog .curY").html(pY);

						//если элемент находится в нужном контейнере
						//включаем режим привязки 
						if (((pX < leftEdge && pX > myMap.position().left) &&
							  pY < topEdge && pY > myMap.position().top)) {

							var fWidth = parseInt(ns.Map.fieldWidth);
							var fHeight = parseInt(ns.Map.fieldHeight);

							ui.helper.draggable("option", "grid", [fWidth, fHeight]);

						} else {
							ui.helper.draggable("option", "snap", false);
							ui.helper.draggable("option", "grid", false);

							ui.helper.position.left = pX;
							ui.helper.position.top = pY;
						}
					}
				})(this),
				stop: (function(item) {
					return function(e, ui) {

						var pX, pY, leftEdge, topEdge, nonOffsetY, nonOffsetX,
							mapOffsetX, mapOffsetY;

						mapOffsetX = myMap.offset().left;
						mapOffsetY = myMap.offset().top;
						leftEdge = mapOffsetX + myMap.width();
						topEdge = mapOffsetY + myMap.height();

						var parent = ui.helper.parent();
						var segmentWidth = parseInt(ns.Map.fieldWidth);
						var segmentHeight = parseInt(ns.Map.fieldHeight);

						var currentXOffset = parent.offset().left;
						var currentYOffset = parent.offset().top;

						pX = currentXOffset + ui.position.left;
						pY = currentYOffset + ui.position.top;

						nonOffsetX = pX - mapOffsetX;
						nonOffsetY = pY - mapOffsetY;

						//изменяем позицию элемента и создаем клон
						//если элемент находится в зоне карты
						//позиция элемента должна быть зафиксирована в ячейке
						if ((pX <= leftEdge && pY <= topEdge &&
							pX >= mapOffsetX &&
							pY >= mapOffsetY) &&
							!item.detectCollision(pX, pY) &&
						    (nonOffsetX % segmentWidth) === 0 &&
						    (nonOffsetY % segmentHeight) === 0) {
							
							ui.helper.position.left = pX;
							ui.helper.position.top = pY;

							previousGeometry.left = pX;
							previousGeometry.top = pY;

							item.leftPosition = pX;
							item.topPosition = pY;
							//переписываем координаты
							item.positionX = nonOffsetX / parseInt(ns.Map.fieldWidth);
							item.positionY = nonOffsetY / parseInt(ns.Map.fieldHeight);
							item.inOwnContainer = true;
							item.positionReady = true;
						}
						else {

							ui.helper.animate({
								"left": previousGeometry.left,
								"top": previousGeometry.top
							}, 500);
						}
					}
				})(this)
			});

			div.on('dblclick', function(e) {
				console.log("ROTATE");
				if (selection) {
					selection.rotateCW(
						e.clientX,
						e.clientY
					);
				}
			});

			div.on('click', this, function(context) {
				console.log("SELECT");
				selection = context.data;
			});

			mappedResources[this.idx] = this;

			return div;
		},
		createElement: function() {
			//ищем соседние элементы
			var x, y;
		},
		isDestroy: function() {
			//
			;
		},
		setHit: function(x, y) {
			this.css('backgroundColor', 'red');
		},
		createObjects: function(count) {
			this.createVariant(false);
			this.pool = [];
			for (var i=0; i < count; i++) {
				var newObject = {
					type: this.type,
					width: this.width,
					height: this.height,
					startX: this.startX + (this.width + 1) * i,
					startY: this.startY,
					orientation: this.orientation,
					map: this.map,
					toJson: function() {
						//набор аттрибутов для сериализации объекта
						var includeOptions = ['width', 'height',
							'positionX', 'positionY', 'orientation', 'type'];
						var jsonE = {};
						for (var op in this) {
							if (this.hasOwnProperty(op) &&
							    includeOptions.indexOf(op) !== -1) {
								jsonE[op] = this[op];
							}
						}
						return jsonE;
					},
					fromJson: function() {

					}
				};
				newObject.draw = this.draw;
				newObject.draw.bind(newObject);
				newObject.getWidth = this.getWidth;
				newObject.getWidth.bind(newObject);
				newObject.getHeight = this.getHeight;
				newObject.getHeight.bind(newObject);
				newObject.rotateCW = this.rotateCW;
				newObject.rotateCW.bind(newObject);
				this.pool.push(newObject);
			}
		}

	}	

	var SingleShip = function(map, count, placeX, placeY) {
		this.type = "single";
		this.createVariant = function(opposite) {

			this.width = !opposite? 1: 1;
			this.height = !opposite? 1: 1;
			this.startX = placeX;
			this.startY = placeY;
			this.orientation = (opposite && "V") || "H";
		}
		this.map = map;
		this.createObjects(count || 1);
	}

	var DoubleShip = function(map, count, placeX, placeY) {
		this.type = "double";
		this.createVariant = function(opposite) {
			this.width = !opposite? 2: 1;
			this.height = !opposite? 1: 2;
			//стартовые позиции кораблей
			this.startX = placeX;
			this.startY = placeY;
			this.orientation = (opposite && "V") || "H";
		}
		this.map = map;
		this.createObjects(count || 1);
	}

	var TripleShip = function(map, count, placeX, placeY) {
		this.type = "triple";
		this.createVariant = function(opposite) {
			this.width = !opposite? 3: 1;
			this.height = !opposite? 1: 3;
			//стартовые позиции кораблей
			this.startX = placeX;
			this.startY = placeY;
			this.orientation = (opposite && "V") || "H";
		}
		this.map = map;
		this.createObjects(count || 1);
	}

	var QuadShip = function(map, count, placeX, placeY) {
		this.type = "quad";
		this.createVariant = function(opposite) {
			this.width = !opposite? 4: 1;
			this.height = !opposite? 1: 4;
			//стартовые позиции кораблей
			this.startX = placeX;
			this.startY = placeY;
			this.orientation = (opposite && "V") || "H";
		}
		this.map = map;
		this.createObjects(count || 1);
	}

	SingleShip.prototype = ns.FieldComponent;
	DoubleShip.prototype = ns.FieldComponent;
	TripleShip.prototype = ns.FieldComponent;
	QuadShip.prototype = ns.FieldComponent;

})($, window);