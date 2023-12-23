// DOM elements.
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')
const endCall = document.getElementById('end-call-button')
const shareCall = document.getElementById('share-button')
const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
const remoteVideoComponent = document.getElementById('remote-video')

// Variables.
const socket = io()
const mediaConstraints = {
  audio: true,
  video: { width: 1280, height: 720 },
}
let localStream
let remoteStream
let isRoomCreator
let rtcPeerConnection // Connection between the local device and the remote peer.
let roomId
let c = 0
let isJoined = false
// Free public STUN servers provided by Google.
const iceServers = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
}

// Audio recording variables
let mediaRecorder
let recordedAudioChunks = []

// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  
  connectButton.disabled = true
  joinRoom(roomInput.value)
})

endCall.addEventListener('click', () => {
  endCallHandler()
})

shareCall.addEventListener('click', () => {
  copyRoomUrlToClipboard()
})

// SOCKET EVENT CALLBACKS =====================================================
socket.on('room_created', async () => {
  console.log('Socket event callback: room_created')

  // await setLocalStream(mediaConstraints)
  isRoomCreator = true
})

socket.on('end_call', () => {
  console.log('Socket event callback: end_call')
  endCallHandler()
})

socket.on('room_joined', async () => {
  console.log('Socket event callback: room_joined')
  isJoined = true
  // Wait for room joining before capturing media
  await setLocalStream(mediaConstraints)
  socket.emit('start_call', roomId)
})

socket.on('full_room', () => {
  console.log('Socket event callback: full_room')

  alert('The room is full, please try another one')
})

socket.on('start_call', async () => {
  console.log('Socket event callback: start_call')
  await setLocalStream(mediaConstraints)

  if (isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    rtcPeerConnection.onicecandidate = sendIceCandidate
    await createOffer(rtcPeerConnection)
  }
})

socket.on('webrtc_offer', async (event) => {
  console.log('Socket event callback: webrtc_offer')

  if (!isRoomCreator) {
    rtcPeerConnection = new RTCPeerConnection(iceServers)
    addLocalTracks(rtcPeerConnection)
    rtcPeerConnection.ontrack = setRemoteStream
    rtcPeerConnection.onicecandidate = sendIceCandidate
    rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
    await createAnswer(rtcPeerConnection)
  }
})

socket.on('webrtc_answer', (event) => {
  console.log('Socket event callback: webrtc_answer')

  rtcPeerConnection.setRemoteDescription(new RTCSessionDescription(event))
})

socket.on('webrtc_ice_candidate', (event) => {
  console.log('Socket event callback: webrtc_ice_candidate')

  // ICE candidate configuration.
  var candidate = new RTCIceCandidate({
    sdpMLineIndex: event.label,
    candidate: event.candidate,
  })

  rtcPeerConnection.addIceCandidate(candidate)
  showVideoConference()
})

socket.on('recorded_audio', (event) => {
  const { recordedAudioBlob } = event
  downloadRecordedAudio(recordedAudioBlob)

  // const audioElement = new Audio(URL.createObjectURL(recordedAudioBlob));
  // audioElement.play();
})

// FUNCTIONS ==================================================================
function joinRoom(room) {
  if (room === '') {
    alert('Please type a room ID')
  } else {
    roomId = room
    socket.emit('join', room)
    shareCall.style = 'display: inline'
    shareCall.className = 'btn btn-primary share-button-container'
  }
}

function endCallHandler() {
  if (rtcPeerConnection) {
    // Close the peer connection
    console.log('Connection closed!')
    rtcPeerConnection.close()
    rtcPeerConnection = null
  }

  // Stop the local stream tracks
  if (localStream) {
    localStream.getTracks().forEach((track) => {
      track.stop()
    })
  }

  // Stop recording if it's in progress
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }

  // Reset video elements
  localVideoComponent.srcObject = null
  remoteVideoComponent.srcObject = null

  // Hide video chat container and show room selection container
  videoChatContainer.style = 'display: none'
  roomSelectionContainer.style = 'display: block; max-width: 25rem; background-color: #333'
  endCall.style = 'display: none'

  // Emit an event to signal the end of the call
  socket.emit('end_call', roomId)
}

function showVideoConference() {
  roomSelectionContainer.style = 'display: none'
  videoChatContainer.style = 'display: block'
  endCall.style = 'margin-left: 50%; display: block'
}

async function setLocalStream(mediaConstraints) {
  let stream
  try {
    stream = await navigator.mediaDevices.getUserMedia(mediaConstraints)
  } catch (error) {
    console.error('Could not get user media', error)
  }

  localStream = stream
  localVideoComponent.srcObject = stream

  // Add audio recording logic
  setTimeout(() => {
    startRecordingLocalAudio(stream)
  }, 10000)
}

function downloadRecordedAudio(blob) {
  const audioBlob = new Blob([blob], { type: 'audio/webm' })
  const audioURL = window.URL.createObjectURL(audioBlob)

  const anchorElement = document.createElement('a')
  anchorElement.href = audioURL
  anchorElement.download = 'recorded_audio' + c++ + '.webm' // Change the filename if needed
  document.body.appendChild(anchorElement) // Append to the body for Firefox
  // anchorElement.click();                 //TO DOWNLOAD
  document.body.removeChild(anchorElement) // Remove after click
}

function startRecordingLocalAudio(stream) {
  const audioTrack = stream.getAudioTracks()[0]

  function startNewRecording() {
    mediaRecorder = new MediaRecorder(new MediaStream([audioTrack]))

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedAudioChunks.push(event.data)
      }
    }

    mediaRecorder.onstop = () => {
      if (mediaRecorder.state === 'inactive') {
        const recordedAudioBlob = new Blob(recordedAudioChunks, { type: 'audio/webm' })
        socket.emit('recorded_audio', { recordedAudioBlob, roomId })

        // Reset the recorded audio chunks array
        recordedAudioChunks = []

        // Start a new recording after 5 seconds
        setTimeout(startNewRecording, 5000)
      }
    }

    // Start recording only if the MediaRecorder is in the 'inactive' state
    if (mediaRecorder.state === 'inactive') {
      try {
        mediaRecorder.start()

        // Stop recording after 5 seconds (configurable)
        setTimeout(() => {
          mediaRecorder.stop()
        }, 5000)
      } catch (error) {
        console.log('Call ended!')
      }
    }
  }

  // Start the first recording
  startNewRecording()
}

function addLocalTracks(rtcPeerConnection) {
  localStream.getTracks().forEach((track) => {
    rtcPeerConnection.addTrack(track, localStream)
  })
}

async function createOffer(rtcPeerConnection) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createOffer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  socket.emit('webrtc_offer', {
    type: 'webrtc_offer',
    sdp: sessionDescription,
    roomId,
  })
}

async function createAnswer(rtcPeerConnection) {
  let sessionDescription
  try {
    sessionDescription = await rtcPeerConnection.createAnswer()
    rtcPeerConnection.setLocalDescription(sessionDescription)
  } catch (error) {
    console.error(error)
  }

  socket.emit('webrtc_answer', {
    type: 'webrtc_answer',
    sdp: sessionDescription,
    roomId,
  })
}

function copyRoomUrlToClipboard() {
  const roomUrl = window.location.href;
  const roomText = `Join my video chat room: ${roomUrl} \n\nRoom ID : ${roomId}`;

  // Check if Web Share API is available
  if (navigator.share) {
    navigator.share({
      title: 'Video Chat Room',
      text: roomText
        })
      .then(() => console.log('Room URL shared successfully!'))
      .catch((error) => console.error('Error sharing room URL:', error));
  } else {
    // Web Share API not available, fallback to clipboard copy
    copyRoomUrlToClipboardFallBack(roomText);
  }
}

function copyRoomUrlToClipboardFallBack(roomText) {
  // Create a temporary textarea element to copy the text to clipboard
  const tempInput = document.createElement('textarea');
  tempInput.style.whiteSpace = 'pre-line'; // Set whiteSpace on the textarea
  tempInput.value = roomText;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand('copy');
  document.body.removeChild(tempInput);

  // Optionally, you can provide user feedback that the text is copied
  alert('Room URL copied to clipboard!');
}


function setRemoteStream(event) {
  remoteVideoComponent.srcObject = event.streams[0]
  remoteStream = event.stream
}

function sendIceCandidate(event) {
  if (event.candidate) {
    socket.emit('webrtc_ice_candidate', {
      roomId,
      label: event.candidate.sdpMLineIndex,
      candidate: event.candidate.candidate,
    })
  }
}
