/* jshint esversion: 6 */

const fs = require("fs");
let db = require('./usersdb');

const express = require('express');
const app = express();

const http = require('http').Server(app);
const io = require('socket.io')(http);
const portNum = 3006;

const yt_credz = require('./yt-credz');
const google = require('googleapis');
const youtube = google.youtube('v3');
const OAuth2 = google.auth.OAuth2;
const redirect_url = process.argv[2] || 'http://localhost:'+portNum+'/app';

const request = require('request');
const parse_str = require('locutus/php/strings/parse_str');


// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~  SETUP GOOGLE OAUTH
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~

let oauth2Client = new OAuth2(
	yt_credz.clientId,
	yt_credz.clientSecret,
	redirect_url
);

console.log('int oauth2Client',oauth2Client);

let googleAuthURL = oauth2Client.generateAuthUrl({
	scope: "https://www.googleapis.com/auth/youtube",
	access_type: 'offline',//'online'
	state: { status: 'loggedIn' }
});

function saveNewUserToDB( username, token ){
	db[username] = token;
	let string = JSON.stringify(db,null,'\t');
	fs.writeFile(__dirname+'/usersdb.json',string,function(err) {
		if(err) return console.error(err);
		else console.log('added '+username+' to userdb.json');
	});
}

function getUserTokenFromDB( username ){
	return db[username];
}

// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ .   YOUTUBE STORYBOARDS
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~

function getYTStoryBoardURLz( id, callback ){
	let url = `http://www.youtube.com/get_video_info?video_id=${id}&asv=3&el=detailpage&hl=en_US`;
	request( url, (err,res,body)=>{
		if(err) return console.error(err);
		// meta data to array
		let vidNfo = [];
		parse_str(body, vidNfo);
		if( typeof vidNfo.storyboard_spec !== "undefined"){
			// get storybaord specs specifically
			let sb_spec = decodeURIComponent((vidNfo.storyboard_spec+'').replace(/\+/g, '%20'));
				sb_spec = sb_spec.split('|');
			// build base url
			let baseUrl = sb_spec[0].split("$");
				baseUrl = baseUrl[0] + '2/M';
			// get sigh param
			if( typeof sb_spec[3] == "undefined" ){
				callback(null);
				return;
			}
			let sigh = sb_spec[3].split('#');
				sigh = sigh.pop();
			// get num of imgs
			let num = ( vidNfo.length_seconds >= 1200 ) ?
				vidNfo.length_seconds/240 : 5;
			// build url list
			let urls = [];
			for (let i = 0; i < num; i++) urls.push( baseUrl+i+'.jpg?sigh='+sigh );
			// send data bax to client
			callback(urls);
		} else {
			callback(null);
		}
	});
}


// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~  SOCKETS COMMUNIQUE
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~

io.on('connection', function(socket){
	// console.log('a user connected');

	socket.on('refresh',(username)=>{
		// THERE IS NO FUNCTION TO CALL THIS EVENT, READ BELOW:
		// if i need to test refreshing access_token in the future
		// from client console do: socket.emit('refresh');
		// ^ this assumes user has already "logged in", ie. credz initally set
		oauth2Client.refreshAccessToken(function(err, tokens) {
			// your access_token is now refreshed and stored in oauth2Client
			// IF NECESSARY TO USE THIS EVENT, WRIET LOGIC TO SAVE NEW TOKEN TO DB
			// ^ TEST THIS LOGIC ( B4 GETTING RID OF OLD DB ENTRIES )
			if(err) console.log("TOCKEN-ERR:",err);
			console.log("TOKENS",tokens);
		});
		// SIDENOTE: refresh tokens only get created if access_type
		// in googleAuthURL is set to 'offline'
	});

	// ..... client would like to confirm user ......
	socket.on('get db user confirmation', (data)=>{
		// check if user already in db
		if( typeof db[data.username] == "object" ){
			socket.emit('user confirmation from db','old_user');
		} else {
			socket.emit('user confirmation from db','new_user');
			// create a token && generate an entry in the db
			oauth2Client.getToken(data.gcode, function (err, tokens) {
				if(err) console.log("GET-TOCKEN-ERR:",err);
				saveNewUserToDB( data.username, tokens );
			});
		}
	});

	// ..... client would like a video's storyBoard ......
	socket.on('get storyboard', (vidId)=>{
		getYTStoryBoardURLz( vidId, (data)=>{
			socket.emit('storyboard data',data);
		});
	});

	// ..... client would like to add to playlist ......
	socket.on('add to playlist', ( data )=>{
		oauth2Client.setCredentials( getUserTokenFromDB(data.username) );

		youtube.playlistItems.insert({
			auth: oauth2Client,
			part: 'snippet',
			resource: {
				snippet:{
					playlistId: data.playlist,
					resourceId: {
						kind: "youtube#video",
						videoId: data.vid
					}
				}
			}
		}, function(err, res) {
			if(err) console.log(err);
			// console.log(res);
			socket.emit('playlist response',res);
		});
	});

	// ..... client would like to add a list of videos to a playlist ......
	socket.on('add list to playlist', ( data )=>{
		oauth2Client.setCredentials( getUserTokenFromDB(data.username) );

		let cnt = 0;

		function addAnother( id ){
			youtube.playlistItems.insert({
				auth: oauth2Client,
				part: 'snippet',
				resource: {
					snippet:{
						playlistId: data.playlist,
						resourceId: {
							kind: "youtube#video",
							videoId: data.list[cnt]
						}
					}
				}
			}, function(err, res){
				if(err) {
					console.log(err);
					socket.emit('list add response',`${err.code}:${err.errors[0].message}`);
					cnt++;
					if( cnt < data.list.length ) addAnother( cnt );
				} else {
					socket.emit('list add response',res.snippet.title);
					cnt++;
					if( cnt < data.list.length ) addAnother( cnt );
				}
			});
		}

		addAnother( cnt );
	});

});


// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ ROUTING
// ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~ . ~ * ~


// static files ---------------
// ----------------------------
app.use(express.static(__dirname +'/public'));

// templates ------------------
// ----------------------------
app.engine('html', require('hogan-express'));
app.set('views', __dirname + '/views');
app.set('view engine', 'html');

// verbs ----------------------
// ----------------------------
app.get('/', function (req, res){
	res.render('index', { message:'BB-YT-SCANNER',url:googleAuthURL });
});
app.get('/app', function (req, res){
	res.render('app', { apiKey: yt_credz.apiKey });
});
app.get('/add', function (req, res){
	res.render('add');
});

// listen ---------------------
// ----------------------------
let server = http.listen(portNum, function () {
	let host = server.address().address;
	let port = server.address().port;
	console.log('listening at http://%s:%s', host, port);
});
