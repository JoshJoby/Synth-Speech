const express = require('express');
const app = express();
const server = require('http').createServer(app);
const io = require('socket.io')(server);

app.use('/', express.static(__dirname));

app.get('/test', (req, res) => {
  res.send('This is a test response for /test endpoint');
});
 
io.on('connection', (socket) => {
  socket.on('join', (roomId) => {
    const selectedRoom = io.sockets.adapter.rooms[roomId];
    const numberOfClients = selectedRoom ? selectedRoom.length : 0;

    // These events are emitted only to the sender socket.
    if (numberOfClients == 0) {
      console.log(`Creating room ${roomId} and emitting room_created socket event`);
      socket.join(roomId);
      socket.emit('room_created', roomId);
    } else if (numberOfClients == 1) {
      console.log(`Joining room ${roomId} and emitting room_joined socket event`);
      socket.join(roomId);
      socket.emit('room_joined', roomId);
    } else {
      console.log(`Can't join room ${roomId}, emitting full_room socket event`);
      socket.emit('full_room', roomId);
    }
  });

  // These events are emitted to all the sockets connected to the same room except the sender.
  socket.on('start_call', (roomId) => {
    console.log(`Broadcasting start_call event to peers in room ${roomId}`);
    socket.broadcast.to(roomId).emit('start_call');
  });
  
  socket.on('toggle_webcam', (event) => {
    const { roomId, webcamEnabled } = event;
    socket.to(roomId).emit('toggle_webcam', { webcamEnabled });
  });

  socket.on('end_call', (roomId) => {
    console.log(`Ending call in room ${roomId}`);
    io.to(roomId).emit('end_call');
  });

  socket.on('mute_user', (event) => {
    const { roomId, userId } = event;
    console.log(`Muting user in room ${userId}`);
    io.to(socket.id).emit('mute');
  });

  socket.on('unmute_user', (event) => {
    const { roomId, userId } = event;
    console.log(`unMuting user in room ${userId}`);
    io.to(socket.id).emit('unmute');
  });

  socket.on('chat_message', (event) => {
    console.log(`Broadcasting chat_message event to peers in room ${event.roomId}`);

    // Broadcast the chat message to all participants in the room except the sender.
    socket.broadcast.to(event.roomId).emit('chat_message', { sender: socket.id, message: event.message });
  });


  socket.on('webrtc_offer', (event) => {
    console.log(`Broadcasting webrtc_offer event to peers in room ${event.roomId}`);
    socket.broadcast.to(event.roomId).emit('webrtc_offer', event.sdp);
  });

  socket.on('webrtc_answer', (event) => {
    console.log(`Broadcasting webrtc_answer event to peers in room ${event.roomId}`);
    socket.broadcast.to(event.roomId).emit('webrtc_answer', event.sdp);
  });

  socket.on('webrtc_ice_candidate', (event) => {
    console.log(`Broadcasting webrtc_ice_candidate event to peers in room ${event.roomId}`);
    socket.broadcast.to(event.roomId).emit('webrtc_ice_candidate', event);
  });
  

  // Handle the recorded audio event
  socket.on('recorded_audio', (event) => {
    console.log(`Broadcasting recorded_audio event to peers in room ${event.roomId}`);

    // Broadcast the recorded audio to all participants in the room except the sender.
    socket.broadcast.to(event.roomId).emit('recorded_audio', { recordedAudioBlob: event.recordedAudioBlob });
  });
});

// START THE SERVER =================================================================
const port = process.env.PORT || 3000;
server.listen(port, () => {
  console.log(`Express server listening on port ${port}`);
});
