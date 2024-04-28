// DOM elements.
const roomSelectionContainer = document.getElementById('room-selection-container')
const roomInput = document.getElementById('room-input')
const connectButton = document.getElementById('connect-button')
const endCall = document.getElementById('end-call-button')
const shareCall = document.getElementById('share-button')
const videoChatContainer = document.getElementById('video-chat-container')
const localVideoComponent = document.getElementById('local-video')
const localImageComponent = document.getElementById('local-image')
const remoteVideoComponent = document.getElementById('remote-video')
const toggleWebcamButton = document.getElementById('toggle-webcam-button');
const remoteImageComponent = document.getElementById('remote-image')
const audioFiles = [];
// Variables. 
const socket = io()
socket.on('connect', () => {
  console.log('Socket connected successfully!');
});
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
let synthTest = false;

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

window.addEventListener('beforeunload', function (event) {
  // Check if a call is in progress
  if (rtcPeerConnection || localStream) {
    // Notify the server about the call termination
    endCallHandler();
    
    // This will display a confirmation dialog in some browsers
    // to confirm if the user really wants to leave the page.
    event.returnValue = "Are you sure you want to leave the app? Your call will be disconnected.";
  }
});


// BUTTON LISTENER ============================================================
connectButton.addEventListener('click', () => {
  
  connectButton.disabled = true
  joinRoom(roomInput.value)
})

endCall.addEventListener('click', () => {
  endCallHandler()
})

toggleWebcamButton.addEventListener('click', () => {
  toggleWebcam();
});

shareCall.addEventListener('click', () => {
  copyRoomUrlToClipboard()
})

// SOCKET EVENT CALLBACKS =====================================================
socket.on('room_created', async () => {
  console.log('Socket event callback: room_created')

  // await setLocalStream(mediaConstraints)
  isRoomCreator = true
})

socket.on('end_call', (roomId) => {
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

socket.on('toggle_webcam', (event) => {

  const { webcamEnabled } = event;
  updateRemoteWebcamStatus(webcamEnabled);
});

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
    socket.emit('end_call', roomId)
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
  toggleWebcamButton.style = 'display: none'


  // Emit an event to signal the end of the call
}

function toggleWebcam() {
  if (localStream) {
    const videoTracks = localStream.getVideoTracks();

    if (videoTracks.length > 0) {
      // Disable webcam
      videoTracks[0].enabled = !videoTracks[0].enabled;

      // Show/hide default icon based on webcam status
      if (videoTracks[0].enabled) {
        // Webcam enabled, show user's webcam
        localVideoComponent.srcObject = localStream;
        localImageComponent.style.display = 'none'
        console.log('toggling webcam')
        // console.log(videoTracks[0].enabled)

        socket.emit('toggle_webcam', {
          roomId,
          webcamEnabled: videoTracks[0].enabled,
        });

      } else {
        // Webcam disabled, show default icon
        localVideoComponent.srcObject = null;
        localImageComponent.style = 'display: block; width: 50px; height: 50px'
        console.log('toggling webcam')
        // console.log(videoTracks[0].enabled)

        socket.emit('toggle_webcam', {
          roomId,
          webcamEnabled: videoTracks[0].enabled,
        });
      }

      // Broadcast the webcam toggle event
    }

    
  }
}

function updateRemoteWebcamStatus(webcamEnabled) {
  // Update UI on the receiver's side based on the webcam status
  // (e.g., display default icon)
  console.log('Socket event callback: toggle_webcam');
  console.log(webcamEnabled);
  if (webcamEnabled) {
    // Remote webcam enabled, show remote user's webcam
    console.log('Switching camera on');
    remoteVideoComponent.style.visibility = 'visible';
    remoteImageComponent.style.display = 'none';
  } else {
    // Remote webcam disabled, show default icon
    console.log('Switching camera off');
    remoteVideoComponent.style.visibility = 'hidden';
    remoteImageComponent.style.display = 'block';
  }
}



function showVideoConference() {
  roomSelectionContainer.style = 'display: none'
  videoChatContainer.style = 'display: block'
  endCall.style = ' display: inline-block'
  toggleWebcamButton.style = 'display: inline-block'

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
  const audioBlob = new Blob([blob], { type: 'audio/ogg' })
  const audioURL = window.URL.createObjectURL(audioBlob)

  const anchorElement = document.createElement('a')
  anchorElement.href = audioURL
  const fileName = 'recorded_audio' + c++ + '.ogg' // Change the filename if needed
  audioFiles.push({ blob: audioBlob, fileName: fileName });

  // document.body.appendChild(anchorElement) // Append to the body for Firefox
  // // anchorElement.click();                 //TO DOWNLOAD
  // document.body.removeChild(anchorElement) // Remove after click
}

function showPopup(message, options = {}) {
  // Create modal element
  const modal = document.createElement('div');
  modal.className = 'modal fade';
  modal.innerHTML = `
    <div class="modal-dialog">
      <div class="modal-content">
        <div class="modal-body">${message}</div>
      </div>
    </div>`;
  // Add modal to the body
  document.body.appendChild(modal);
  // Show modal
  $(modal).modal('show');
  // Trigger vibration
  if (navigator.vibrate) {
    navigator.vibrate([200, 100, 200]);
  }
  // Close modal after animation
  if (options.autoClose) {
    setTimeout(() => {
      $(modal).modal('hide');
    }, 5000);
  }
  // Handle options for the second popup
  if (options.buttons) {
    const modalBody = modal.querySelector('.modal-body');
    const buttonDiv = document.createElement('div');
    buttonDiv.className = 'text-center';
    buttonDiv.innerHTML = `
      <button type="button" class="btn btn-primary mr-2" id="stayOnCallBtn">Stay on Call</button>
      <button type="button" class="btn btn-danger" id="exitCallBtn">Exit Call</button>
    `;
    modalBody.appendChild(buttonDiv);
    // Add event listeners to buttons
    const stayOnCallBtn = modal.querySelector('#stayOnCallBtn');
    const exitCallBtn = modal.querySelector('#exitCallBtn');
    stayOnCallBtn.addEventListener('click', () => {
      $(modal).modal('hide');
    });
    exitCallBtn.addEventListener('click', () => {
      $(modal).modal('hide');
      endCall.click();
      clearInterval(intervalId);
    });
    // Start timer for auto closing the popup if no interaction
    let timer;
    const closePopup = () => {
      $(modal).modal('hide');
      clearInterval(timer);
    };
    timer = setTimeout(closePopup, 10000); // 10 seconds timer
    // Restart timer if any interaction occurs
    modal.addEventListener('click', () => {
      clearTimeout(timer);
      timer = setTimeout(closePopup, 10000); // Restart timer
    });
  }
  // Remove modal after animation
  $(modal).on('hidden.bs.modal', function (e) {
    modal.remove();
  });
}

function sendAudioFiles() {
  if (audioFiles.length === 0) {
    console.log("No audio files to send.");
    return;
  }

  let modelResult;
  // Prepare FormData to send audio files
  const formData = new FormData();
  audioFiles.forEach((audioFile) => {
    formData.append('audioFiles', audioFile.blob, audioFile.fileName);
  });
  // Send HTTP POST request
  // fetch('https://synthspeechapi.azurewebsites.net/upload_audio', {
    fetch('http://synthspeechapi.azurewebsites.net/upload_audio', {
    method: 'POST',
    body: formData
  })  
  .then(response => {
    return response.json(); // Return the promise
  })
  .then(responseText => {
    modelResult = responseText
    console.log("RESPONSE : " + responseText.predictions); // Log the response text
    let testSum = 0
    for(var i = 0; i < 6; i++){
      testSum = testSum + responseText.predictions[i];
    }
    if(testSum == 6){
      if(!synthTest){
        console.log("BOT ACTIVITY DETECTED!");
        showPopup("BOT ACTIVITY DETECTED!", { autoClose: true });
        synthTest = true;
      }
      else{
        console.log("BOT ACTIVITY DETECTED TWICE! ENDING CALL");
        showPopup("BOT ACTIVITY DETECTED TWICE! <br>DO YOU WANT TO END THE CALL?<br><br>", { buttons: true });
        // endCall.click();
        // clearInterval(intervalId);
      }
    }
    audioFiles.length = 0;
    c = 0;
  })
    .catch(error => {
      console.error('Error sending audio files:', error);
      console.log(error.message);
      console.log(formData);
    });
}

// Set interval to send audio files every 30 seconds
let intervalId = setInterval(sendAudioFiles, 30000);


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
        const recordedAudioBlob = new Blob(recordedAudioChunks, { type: 'audio/ogg' })
        socket.emit('recorded_audio', { recordedAudioBlob, roomId })

        // Reset the recorded audio chunks array
        recordedAudioChunks = []

        // Start a new recording after 5 seconds
        // setTimeout(startNewRecording, 5000)
        startNewRecording();
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
  console.log('Setting remote stream')
  if (event.streams.length > 0 && event.streams[0].getVideoTracks().length > 0) {
    // Remote user has a video stream, display it
    remoteVideoComponent.srcObject = event.streams[0];
    remoteImageComponent.style.display = 'none'
  } else {
    // Remote user does not have a video stream, display default icon
    remoteVideoComponent.srcObject = null;
    remoteImageComponent.style = 'display: block; width: 100px; height: 100px'
  }

  remoteStream = event.stream;
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
