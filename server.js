// Express server
var express = require('express'),
	app = express(),
	http = require('http'),
	server = http.createServer(app),
	path = require('path'),
	io = require('socket.io').listen(server),
	nano = require('nano')('http://pi:pi@localhost:8000'),
	crypto = require('crypto'),
	connect = require('connect'),
	parseCookie = connect.utils.parseCookie,
	MemoryStore = connect.middleware.session.MemoryStore,
	store,
	users = 0;


server.listen(3000);
console.log("Express server listening on port 3000");

// VisibleForTesting functions
module.exports.processUser = processUser;

// Allow access to /public folder
app.configure(function () {
	app.use(express.cookieParser());
	app.use(express.session({
		key: 'OPENRPG_ID',
    	secret: 'ADRG$WHSRHRWUsdfj@~€7ghzdfhgksdjñ76857hkse',
    	store: store = new MemoryStore(),
	    cookie: {
			path: '/',
			domain: 'uplei.com',
			maxAge: 1000 * 60 * 24 // 24 hours
	    }
 	}));
	app.use(express.bodyParser());
	app.use(app.router);
    app.use(express.static(path.join(__dirname,'/public'), {maxAge: 0}));
});

/**
 * Process a list of users retrieved from the DB.
 * 
 * @param err - error message
 * @param body - the response from the DB call
 * @return - json object containing { title : ... , data: ... , error: ... }
 */
function processUser(err, body) {
    var response = {};
    response.data = [];
    
    if(!err) {
        response.title = "Users";
        body.rows.forEach(function(doc){
            response.data.push(doc);
        });
    } else {
        response.title = "Error";
        response.error = err;
    }

    return response;
}


// List all users
app.get('/api/list', function (req, res) {
	var users = nano.use('users');
	users.list(function(err, body){
		var response = processUser(err, body);
		res.send(response);
	});
});

// CouchDB Access
app.post('/api/db', function (req, res) {
	// Nano!
	var nano = require('nano')('http://pi:pi@localhost:8000');
    if(req.body == undefined){
    	req.body = {user : {type : 'Unsupported'}};
    }
    
    console.log("POST to /api/db: ", req.body.type);
    
    //TODO Improve this section
    switch(req.body.type){
    	case 'register':
    		var data = req.body.user,
    			users = nano.use('users');
    		// Sha1 of password
    		var sha1 = crypto.createHash('sha1');
		    sha1.update(data.pass);
		    // Insert in database
			users.insert({_id: data.name.toLowerCase(), pass: sha1.digest('hex')}, function(err, body) {
				if (err){
					if(err.status_code == 409){
						res.send("El usuario ya existe!!");
					}else{
						res.send("Ha ocurrido un error extraño con el servidor, intentalo mas tarde");
					}
					//res.end();
				}else{
					res.redirect('/');
				}
			});
		    
    		break;
		default:
			res.send(JSON.stringify('Unsupported'));
    }
});

// SocketIO

io.set('log level', 2); // 0 error, 1 warnings, 2 info, 3 for debug

// Client authorisation
io.set('authorization', function (data, accept) {
	// Now use data.query to handle login
	// Check if user exists
	var users = nano.use('users');
	// Sha1 password
	var sha1 = crypto.createHash('sha1');
	sha1.update(data.query.pass);
	
	users.view('lists','user-pass', {key: [data.query.user.toLowerCase(), sha1.digest('hex')]}, function (error, view) {
		if(error !== null){
			console.error(error);
			accept(null,false);
		}else{
			if(view.rows.length > 0){
				data.user = data.query.user;
				console.log("Login ok, User="+view.rows[0].id);
				accept(null, true);
			}else{
				accept(null,false);
			}
		}
	});
});

// ----------------------------------
// CHAT



io.sockets.on('connection', function(socket){
	
	users++;
	
	// Notify everyone
	io.sockets.in('server').emit('message', {room: 'server', type: 'connect', user: socket.handshake.user});
	
	socket.on('subscribe', function(room) { 
	    socket.join(room);
	});
	
	socket.on('unsubscribe', function(room) {  
	    socket.leave(room);
	});
	
	socket.on('send', function(data) {
		if(data.room == 'chat'){
			// Chat message
			data.user = socket.handshake.user;
	    	io.sockets.in(data.room).emit('message', data);
		}else if(data.room == 'position'){
			// User position
			socket.broadcast.to('position').emit('update', { user: socket.handshake.user, position: data.position});
		}
		
	});
	
	socket.on('ping', function(data) {
	    socket.emit('ping', data);
	});
	
	socket.on('map', function(data){
		// Send the requested data
		socket.emit('map', {
			coordinates : data.coordinates,
			size: data.size,
			basesheets: basesheets(data.coordinates, data.size),
			resources: getResources(data.coordinates, data.size)
		});
	});
	
	socket.on('disconnect', function(){

		io.sockets.in('server').emit('message', {room:'server', type: 'disconnect', user: socket.handshake.user});
		
		users--;
	});
	
});

// Socket intervals
var usersOnlineInterval = setInterval(function(){
	io.sockets.in('server').emit('usersOnline', {count:users});
},1000);

// ----------------------------------------- //

/**
 * Dynamic resource generation based on the coordinates.
 * it will generate the same resources for each set of coordinates 
 * @param {Object} Central coordinates of the requested area {x,y}
 * @param {size} Size of the requested area {w,h}
 */
function getResources(coordinates, size){
	
	// Resource definition
	var resources = [
		{
			type : 'tree',
			probability: 0.2,	// Chances of it appearing. Future work might make this dependant on the area
			sizes: [60,120]		// min, max
		}
	];
	
	// Container for the coordinates in use. To ensure that there are no duplicates.
	var usedCoordinates = [],
		returnResources = [];
	
	/*
	 * Now iterate over the coordinates and generate resources.
	 * The coordinates refer to the central point in the rectangle,
	 * so possible coordinates for elements will be {x+-width/2, y+-height/2}
	 * Instead of using a random number generator I will use a sine,
	 * because in JS Math.random doesn't have the option to set the seed.
	 * This should select pseudo randomly some coordinates for each resource.
	 */
	
	// Iterate over each resource
	for(var a=0; a<resources.length; a++){
		// Number of resources to place
		var coordNum = size.w*size.h*resources[a].probability/1000;
		
		// Iterate over each coordinate
		for(var b=0;b<coordNum;b++){
			// Generate a possible set of x,y
			var possibleCoordinates = {
				x: Math.floor(Math.sin((b+1)*15000)*(size.w/2)),
				y: Math.floor(Math.sin((b+1)*6000)*(size.h/2))
			};
			
			// Check if they are available
			if(usedCoordinates.indexOf(possibleCoordinates)>0) continue;
			
			// They are, store and add to the return array
			usedCoordinates.push(possibleCoordinates);
			
			// Generate a pseudo random size
			var resourceSize = Math.floor(resources[a].sizes[1] - (resources[a].sizes[1] - resources[a].sizes[0]) * Math.abs(Math.sin(possibleCoordinates.x * possibleCoordinates.y)));
			
			// Store in return array
			returnResources.push({
				type: resources[a].type,
				coordinates: possibleCoordinates,
				properties: {
					size: Math.min(resources[a].sizes[1], Math.max(resources[a].sizes[0], resourceSize))
				}
			});
		}
	}
	
	return returnResources;
}

/**
 * Dynamically generate the basesheet color. In the future this color
 * might depend on the area type (ocean, land... )
 * @param {Object} Central coordinates of the requested area {x,y}
 * @param {size} Size of the requested area {w,h}
 */
function basesheets(coordinates, size){
	// Basesheets are always 200x200px, so I just need to iterate
	// over the centers of the requested basesheets and generate a pseudo random color
	// First get the top left basesheet center
	var first = {
		x: coordinates.x - size.w/2,
		y: coordinates.y - size.h/2 + 200
	};
	
	var basesheets = [];
	
	for(var col=0; col < size.w/200; col++){
		for(var row=0; row < size.h/200; row++){
			// Generate a pseudo random color
			var color = 'rgba(' + Math.ceil(70 + Math.abs(Math.sin(coordinates.x*col*row*200))*20) + ', 120,' + Math.ceil(30 + Math.abs( Math.sin( coordinates.y * col*row*200))*25)+', 1)';
			
			// Store
			basesheets.push({
				centerp : {
					x: first.x + col*200,
					y: first.y + row*200
				},
				color : color
			});
		}
	}
	
	return basesheets;
}