	/* jshint esversion: 6 */

	let socket = io();
	let username;

	// find vidz -------------------------------------------------------
	let findVidz = document.querySelector('#findVidz');
	let subQuery = document.querySelector('#subQuery');
	let subPlaylist = document.querySelector('#subPlaylist');
	let subChannel = document.querySelector('#subChannel');
	let queryScan = document.querySelector('#queryScan');
	let playlistScan = document.querySelector('#playlistScan');
	let channelScan = document.querySelector('#channelScan');
	let bulkAdder = document.querySelector('#bulkAdder');

	subQuery.addEventListener('click', getVidList );
	subPlaylist.addEventListener('click', getVidList );
	subChannel.addEventListener('click', getVidList );
	bulkAdder.addEventListener('click',function(){
		let urlstr = window.location.toString();
		urlstr = urlstr.replace('app','add');
		window.location = urlstr;
	});

	// scan vidz -------------------------------------------------------
	let videoList = document.querySelector('#videoList');
	let prevPage = document.querySelector('#prevPage');
	let prevVideo = document.querySelector('#prevVideo');
	let nextPage = document.querySelector('#nextPage');
	let nextVideo = document.querySelector('#nextVideo');
	let targPlaylistId = document.querySelector('#targPlaylistId');
	let addToPLBtn = document.querySelector('#addToPLBtn');
	let videoSpeed = document.querySelector('#videoSpeed');
	let updateSpeed = document.querySelector('#updateSpeed');
	let videoPlayer = document.querySelector('#videoPlayer');
	let storyBoard = document.querySelector('#storyBoard');

	nextVideo.addEventListener('click',(e)=>switchVid(e.target.id));
	prevVideo.addEventListener('click',(e)=>switchVid(e.target.id));
	nextPage.addEventListener('click',(e)=>switchPage(e.target.id));
	prevPage.addEventListener('click',(e)=>switchPage(e.target.id));
	updateSpeed.addEventListener('click', setPlaybackRate );
	addToPLBtn.addEventListener('click', addToPlaylist );


	// page events -----------------------------------------------------
	document.addEventListener('keydown',(e)=>{
		// console.log(e.keyCode);
		switch (e.keyCode) {
			case 32: e.preventDefault(); togglePlayback(); break;
			case 38: e.preventDefault(); switchVid('prevVideo'); break;
			case 40: e.preventDefault(); switchVid('nextVideo'); break;
			case 37: e.preventDefault(); switchPage('prevPage'); break;
			case 39: e.preventDefault(); switchPage('nextPage'); break;
			case 65:
				if(e.ctrlKey){
					e.preventDefault();
					addToPlaylist();
				}
			break;
		}
	});

	// api setup -------------------------------------------------------
	let listType;
	let uploadsId;
	let nextPageToken;
	let prevPageToken;
	let iframePlayer;
	let initAPI = setInterval(()=>{
		if( typeof gapi == "object" ){
			// set up client side yt api
			gapi.client.setApiKey( apiKey );
			gapi.client.load("youtube","v3",()=>{
				console.log('api ready');
			});
			clearInterval(initAPI);
		}
	},100);

	function getUserName(){
		if(typeof username=="undefined")
			username = prompt("what's your first name").toLowerCase();
		return username;
	}

	// -----------------------------------------------------------------
	// ------------------------------------------------------- FIND VIDZ
	// -----------------------------------------------------------------

	function getVidList(eve){
		listType = eve.target.id;

		let tcode = window.location.toString().split('code=')[1];

		socket.emit( 'get db user confirmation', {
			username:getUserName(), gcode:tcode
		});
	}

	socket.on('user confirmation from db',function(data){
		if( data == "new_user" ){
			console.log('FIRST TIME USER CONFIRMED');
			getVidListPostConfirmation();
		} else if (data == "old_user" ){
			console.log('RETURNING USER CONFIRMED');
			getVidListPostConfirmation();
		} else {
			console.warn('ISSUE GETTING DB INFO FROM SERVER');
		}
	});

	function getVidListPostConfirmation(){
		if(listType=="subQuery")

			queryForList('search',{
				part: 'snippet', maxResults: 25,
				type:'video', order: 'date',
				q: queryScan.value
			});

		else if(listType=="subPlaylist")

			queryForList('playlistItems',{
				part: 'snippet,contentDetails',
				maxResults: 25, playlistId: playlistScan.value
			});

		else if(listType=="subChannel")

			queryForList('channels',{
				part: 'snippet,contentDetails,statistics',
				maxResults: 25, forUsername: channelScan.value
			});
	}



	function queryForList( api, reqObj ){
		// query api for new list of videos ................
		let req = gapi.client.youtube[ api ].list( reqObj );
		// handle the response .............................
		req.execute((res)=>{
			// hide search section, show video scan section
			findVidz.classList.add('hide');
			scanVidz.classList.remove('hide');
			// if channel, then query for list of "uploads"
			if( typeof reqObj.forUsername == "string" ){
				uploadsId = res.items[0].contentDetails.relatedPlaylists.uploads;
				queryForList('playlistItems',{
					part: 'snippet,contentDetails', maxResults: 25,
					playlistId: uploadsId
				});
			}
			// otherwise show the resulting video list
			else listVideoResults(res);
			// console.log(res); console.log(res.items);
		});
	}

	function listVideoResults(res){
		// console.log(res);
		if(typeof res.nextPageToken == "string") // save next page token
			nextPageToken = res.nextPageToken;
		else nextPageToken = undefined;

		if(typeof res.prevPageToken == "string") // save prev page token
			prevPageToken = res.prevPageToken;
		else prevPageToken = undefined;

		videoList.innerHTML = ""; // clear any previous videos in list

		res.items.forEach((v)=>{ // populate new list
			let div = document.createElement('div');
			div.className = "vid-list-item";
			div.textContent = v.snippet.title;
			let id = (typeof v.id.videoId=="string") ?
				v.id.videoId : v.snippet.resourceId.videoId;
			div.id = "vid__"+id;
			div.onclick = function(){
				let id = this.id.split("id__")[1];
				updateScanVideo( id );
			};
			videoList.appendChild(div);
		});
		// select first video in list
		let first = document.querySelector('#videoList > div:first-child');
		// first.className = "vid-list-item selected";
		updateScanVideo( first.id.split("id__")[1] );
	}

	// -----------------------------------------------------------------
	// ------------------------------------------------ UPDATE SCAN VIDZ
	// -----------------------------------------------------------------

	function updateScanVideo(id){
		// apply selected class to appropriate video
		for (let i = 0; i < videoList.children.length; i++){
			videoList.children[i].className = "vid-list-item";
		}
		document.querySelector('#vid__'+id).classList.add('selected');

		// update iframe player w/new video
		if( typeof iframePlayer == "undefined" ){
			iframePlayer = new YT.Player('videoPlayer', {
				height: '318', width: '560',
				videoId: id, events: {}
			});
		} else {
			iframePlayer.loadVideoById(id);
			iframePlayer.stopVideo();
		}

		// clear previous storyboard
		storyBoard.innerHTML = "";
		// update story board thumbnails
		socket.emit( 'get storyboard', id );
	}

	socket.on('storyboard data', function(data){
		if( data instanceof Array ){
			data.forEach((url)=>{ // create new storyboard
				let img = document.createElement('img');
					img.className ="storyboard-img";
					img.src = url;
				storyBoard.appendChild(img);
			});
		} else {
			storyBoard.textContent = "video is missing storyboard data :(";
		}
	});

	// -----------------------------------------------------------------
	// ---------------------------------------------- SCAN VIDZ CONTROLS
	// -----------------------------------------------------------------


	function togglePlayback(){
		let state = iframePlayer.getPlayerState();
		switch (state) {
			case -1:iframePlayer.playVideo(); break;
			case 0: iframePlayer.playVideo(); break;
			case 1: iframePlayer.pauseVideo(); break;
			case 2: iframePlayer.playVideo(); break;
			case 3: iframePlayer.playVideo(); break;
			case 5: iframePlayer.playVideo(); break;
		}
	}

	function switchVid( dir ){
		let d = (dir=='nextVideo') ? 1 : -1;
		let curVid = document.querySelector('.vid-list-item.selected');
		let i = 0; while( curVid!==videoList.children[i] ) i++;
		if(i===0 && dir=="prevVideo") alert('this is the fist video on the page');
		else if(i==24 && dir=="nextVideo") alert('this is the last video on the page');
		else {
			let id = videoList.children[i+d].id.split("id__")[1];
			updateScanVideo(id);
		}
	}

	function switchPage( dir ){
		let token = ( dir == "nextPage") ? nextPageToken : prevPageToken;
		if( typeof token == "string" ){

			if(listType=="subQuery")

				queryForList('search',{
					pageToken: token,
					part: 'snippet', maxResults: 25,
					type:'video', order: 'date',
					q: queryScan.value
				});

			else if(listType=="subPlaylist")

				queryForList('playlistItems',{
					pageToken: token,
					part: 'snippet,contentDetails',
					maxResults: 25, playlistId: playlistScan.value
				});

			else if(listType=="subChannel")

				queryForList('playlistItems',{
					pageToken: token,
					part: 'snippet,contentDetails',
					maxResults: 25, playlistId: uploadsId
				});

		} else {

			let msg = ( dir == "nextPage") ?
				'you are on the last page of results' :
				'you are on the first page of results';
			alert(msg);
		}
	}

	function setPlaybackRate(){
		if(videoSpeed.value!=="")
			iframePlayer.setPlaybackRate(videoSpeed.value);
		else alert('playback rate field is empty');
	}

	function addToPlaylist(){
		if(targPlaylistId.value===""){
			alert('the playlist id field is empty');
			return;
		}

		let token = window.location.toString().split('code=')[1];

		let curVid = document.querySelector('.vid-list-item.selected');
		let i = 0; while( curVid!==videoList.children[i] ) i++;
		let id = videoList.children[i].id.split("id__")[1];

		socket.emit( 'add to playlist',{
			username: getUserName(),
			gcode: token,
			playlist: targPlaylistId.value,
			vid: id
		});
	}

	socket.on('playlist response', function(msg){
		if( msg === null ){
			alert('there was an error attempting to add to that playlist, make sure the playlist id is correct and belongs to the account you authenticated with');
		} else {
			alert('added '+msg.snippet.title+" to your playlist");
		}
	});
