const socket = io();

document.getElementById('create-room').onclick = () => {
  const betAmount = document.getElementById('bet-amount').value;
  if (betAmount > 0) {
    socket.emit('createRoom', { betAmount });
  }
};

document.getElementById('join-room').onclick = () => {
  const roomId = prompt('Digite o código da sala:');
  socket.emit('joinRoom', roomId);
};

socket.on('roomCreated', (roomId) => {
  document.getElementById('room-info').innerText = `Sala criada! Código: ${roomId}`;
});

socket.on('startGame', ({ roomId, players }) => {
  document.getElementById('room-info').innerText = `Jogo iniciado na sala: ${roomId}`;
});

socket.on('roomError', (message) => {
  alert(message);
});