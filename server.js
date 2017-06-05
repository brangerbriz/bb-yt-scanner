/* jshint esversion: 6 */

const fs = require("fs");

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


let googleAuthURL = oauth2Client.generateAuthUrl({
	scope: "https://www.googleapis.com/auth/youtube",
	access_type: 'online',
	state: { status: 'loggedIn' }
});

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

	// ..... client would like a video's storyBoard ......
	socket.on('get storyboard', (vidId)=>{
		getYTStoryBoardURLz( vidId, (data)=>{
			socket.emit('storyboard data',data);
		});
	});

	// ..... client would like to add to playlist ......
	socket.on('add to playlist', ( data )=>{

		oauth2Client.getToken( data.gcode, function (err, tokens) {
			// Now tokens contains an access_token and an optional refresh_token. Save them.
			if (err) console.log(err);
			else oauth2Client.setCredentials(tokens);

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

// listen ---------------------
// ----------------------------
let server = http.listen(portNum, function () {
	let host = server.address().address;
	let port = server.address().port;
	console.log('listening at http://%s:%s', host, port);
});
