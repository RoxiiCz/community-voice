var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mediasoup = require('mediasoup');




app.get('/', function(req, res){
	res.sendFile(__dirname + '/public/index.html');
})


http.listen(80, function(){
  console.log('listening on *:80');
});





const RTCPeerConnection = mediasoup.webrtc.RTCPeerConnection;
// This is supposed to be our application signaling stack (up to you):

// Create a mediasoup Server.
const mediaServer = mediasoup.Server({
  logLevel   : "debug",
  rtcIPv4    : true,
  rtcIPv6    : false,
  rtcMinPort : 40000,
  rtcMaxPort : 49999
});

// Room options.
const roomOptions = {
  mediaCodecs : [
    {
      kind        : "audio",
      name        : "audio/opus",
      clockRate   : 48000,
      payloadType : 100
    }
  ]
};

// Somehow our app decides to create a room by providing an "appRoom" (which
// is up to the application).

io.on("connection", (appRoom) => {
	console.log("got a new connection");
	mediaServer.createRoom(roomOptions)
	  .then((mediaRoom) => {
	   handleRoom(appRoom, mediaRoom);
	  });
});


function handleRoom(appRoom, mediaRoom) {
  // Handle new participants in the room. Our custom signaling application
  // fires a "join" event when a new participant wishes to join a room (this is
  // up to the application) by providing some data:
  // - `participant` is supposed to be a JSON with info about the participant:
  //   - `username`: An unique username.
  //   - `usePlanB`: Whether it's a Chrome based endpoint.
  //   - `capabilities`: An SDP created by the browser.
  // - `request` is supposed to be a WebSocket or HTTP request that we must
  //   accept or reject (if something is wrong).
  appRoom.on("join", (participant, request) => {
    handleParticipant(participant, request, appRoom, mediaRoom);
		console.log("participant with the username "+participant.username+" joined");
  });
}

function handleParticipant(participant, request, appRoom, mediaRoom) {
  // Create a new mediasoup Peer within the mediasoup Room and create a
  // RTCPeerConnection for it.
  let mediaPeer = mediaRoom.Peer(participant.username);
	console.log(mediaRoom.peers);
  let peerconnection = new RTCPeerConnection({
    peer     : mediaPeer,
    usePlanB : participant.usePlanB
  });
  // Participant is required to join the mediasoup Room by providing a
  // capabilities SDP.
	//console.log(participant);
  peerconnection.setCapabilities(participant.capabilities)
    .then(() => {
      // OK, so accept the request.
      //request.accept();

      // And then generate the initial SDP offer for this participant and send
      // it to him.
      sendSdpOffer(participant, peerconnection, appRoom);
    });

  // When something changes in the mediasoup Room (such as when a new participant
  // joins or a participant leaves) provides this participant with an
  // updated SDP re-offer.
  peerconnection.on("negotiationneeded", () => {
    sendSdpOffer(participant, peerconnection, appRoom);
  });

  // If the participant leaves the room (by means of the custom signaling
  // mechanism up to the application) close its associated peerconnection.
  appRoom.on('disconnect', () => {
    peerconnection.close();
		console.log("user disconnected");
  });
}

function sendSdpOffer(participant, peerconnection, appRoom) {
  // Create an SDP offer for this participant.
  peerconnection.createOffer({
    offerToReceiveAudio : 1,
    offerToReceiveVideo : 0
  })

  // Set it as local description.
  .then((desc) => {
		console.log("set local description");
    return peerconnection.setLocalDescription(desc);
  })
  // Send the SDP offer to the browser.
  .then(() => {
    return appRoom.emit("offer", peerconnection.localDescription.serialize());
  })
  // Upon receipt of the response from the browser, take the SDP answer and
  // set it as remote description.
  .then((data) => {
		console.log("set remote description");
    return peerconnection.setRemoteDescription(data.answer);
  });
}

// NOTE: It's also up to the application how to signal the relationship between
// audio/video streams and their associated room participants.
